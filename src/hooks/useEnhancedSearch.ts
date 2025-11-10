import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Event } from '@/lib/types';

interface EnhancedSearchParams {
  query: string;
  category?: string;
  dateStart?: string;
  dateEnd?: string;
  location?: string;
  priceRange?: string;
  limit?: number;
  offset?: number;
}

interface SearchResult extends Event {
  search_rank: number;
  similarity_score: number;
}

export function useEnhancedSearch(params: EnhancedSearchParams, enabled: boolean = true) {
  const { user } = useAuth();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['enhanced-search', params],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('enhanced_event_search', {
        p_query: params.query,
        p_category: params.category || null,
        p_date_start: params.dateStart || null,
        p_date_end: params.dateEnd || null,
        p_location: params.location || null,
        p_price_range: params.priceRange || null,
        p_limit: params.limit || 50,
        p_offset: params.offset || 0,
      });

      if (error) throw error;

      // Log search analytics
      if (params.query && params.query.length > 2) {
        await supabase.from('search_analytics').insert({
          user_id: user?.id || null,
          search_query: params.query,
          results_count: data?.length || 0,
          search_filters: {
            category: params.category,
            dateStart: params.dateStart,
            dateEnd: params.dateEnd,
            location: params.location,
            priceRange: params.priceRange,
          },
        });
      }

      return (data || []) as SearchResult[];
    },
    enabled: enabled && params.query.length >= 2,
    staleTime: 30 * 1000, // Cache for 30 seconds
  });

  return {
    results: data || [],
    isLoading,
    error,
    refetch,
  };
}

export function useSearchSuggestions(query: string, enabled: boolean = true) {
  const { data, isLoading } = useQuery({
    queryKey: ['search-suggestions', query],
    queryFn: async () => {
      if (query.length < 2) return [];

      const { data, error } = await supabase.rpc('get_search_suggestions', {
        p_query: query,
        p_limit: 10,
      });

      if (error) throw error;
      return data || [];
    },
    enabled: enabled && query.length >= 2,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  return {
    suggestions: data || [],
    isLoading,
  };
}

export function usePopularSearches(days: number = 7) {
  const { data, isLoading } = useQuery({
    queryKey: ['popular-searches', days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_popular_searches', {
        p_days: days,
        p_limit: 10,
      });

      if (error) throw error;
      return data || [];
    },
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
  });

  return {
    popularSearches: data || [],
    isLoading,
  };
}

export function useLogSearchClick() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({
      query,
      eventId,
      position,
    }: {
      query: string;
      eventId: string;
      position: number;
    }) => {
      await supabase.from('search_analytics').insert({
        user_id: user?.id || null,
        search_query: query,
        results_count: 1,
        clicked_event_id: eventId,
        clicked_position: position,
      });
    },
  });

  return {
    logSearchClick: mutation.mutate,
  };
}
