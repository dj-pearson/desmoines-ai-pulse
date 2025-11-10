import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Event } from '@/lib/types';

interface RecommendedEvent extends Event {
  recommendation_score?: number;
  recommendation_reason?: string;
  interaction_count?: number;
}

interface UseEventRecommendationsOptions {
  userLocation?: { latitude: number; longitude: number } | null;
  limit?: number;
  enabled?: boolean;
}

export function useEventRecommendations(options: UseEventRecommendationsOptions = {}) {
  const { isAuthenticated, user } = useAuth();
  const {
    userLocation = null,
    limit = 12,
    enabled = true
  } = options;

  // Fetch personalized recommendations for authenticated users
  const personalizedQuery = useQuery({
    queryKey: ['event-recommendations', 'personalized', user?.id, userLocation, limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_personalized_recommendations', {
        p_user_lat: userLocation?.latitude || null,
        p_user_lon: userLocation?.longitude || null,
        p_limit: limit
      });

      if (error) {
        console.error('Error fetching personalized recommendations:', error);
        throw error;
      }

      return (data || []) as RecommendedEvent[];
    },
    enabled: enabled && isAuthenticated,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch trending events for unauthenticated users or as fallback
  const trendingQuery = useQuery({
    queryKey: ['event-recommendations', 'trending', limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_trending_events', {
        p_limit: limit
      });

      if (error) {
        console.error('Error fetching trending events:', error);
        throw error;
      }

      return (data || []) as RecommendedEvent[];
    },
    enabled: enabled && !isAuthenticated,
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
  });

  // Use personalized for authenticated, trending for others
  const activeQuery = isAuthenticated ? personalizedQuery : trendingQuery;

  return {
    recommendations: activeQuery.data || [],
    isLoading: activeQuery.isLoading,
    isError: activeQuery.isError,
    error: activeQuery.error,
    refetch: activeQuery.refetch,
    isPersonalized: isAuthenticated,
  };
}

// Hook to prefetch recommendations (useful for performance optimization)
export function usePrefetchRecommendations() {
  const { isAuthenticated, user } = useAuth();

  const prefetch = async (userLocation?: { latitude: number; longitude: number } | null) => {
    if (isAuthenticated) {
      await supabase.rpc('get_personalized_recommendations', {
        p_user_lat: userLocation?.latitude || null,
        p_user_lon: userLocation?.longitude || null,
        p_limit: 12
      });
    } else {
      await supabase.rpc('get_trending_events', {
        p_limit: 12
      });
    }
  };

  return { prefetch };
}
