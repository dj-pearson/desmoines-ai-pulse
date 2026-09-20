import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EVENT_LIST_COLUMNS } from '@/lib/listColumns';
import { queryKeys } from '@/lib/queryKeys';
import { escapeLikePattern } from '@/lib/postgrestPattern';

export interface Venue {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  address: string | null;
  capacity: number | null;
  venue_type: string | null;
  image_url: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

export function useVenues() {
  return useQuery({
    queryKey: ['venues'],
    queryFn: async (): Promise<Venue[]> => {
      const { data, error } = await supabase
        .from('venues')
        .select('*')
        .order('name');

      if (error) throw error;
      return (data ?? []) as unknown as Venue[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useVenue(slug: string) {
  return useQuery({
    queryKey: ['venue', slug],
    queryFn: async (): Promise<Venue | null> => {
      const { data, error } = await supabase
        .from('venues')
        .select('*')
        .eq('slug', slug)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return data as unknown as Venue;
    },
    enabled: !!slug,
    staleTime: 10 * 60 * 1000,
  });
}

export function useVenueEvents(venueName: string) {
  return useQuery({
    // WEB-PERF-032: the key was top-level, so an admin edit never reached it;
    // and select('*') pulled search_vector and the PostGIS geom into a list of
    // 20 cards. Both fixed. The venue name is escaped because % and _ are LIKE
    // wildcards - an unescaped one silently widens the match.
    queryKey: queryKeys.events.list({ venue: venueName }),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select(EVENT_LIST_COLUMNS)
        .ilike('venue', `%${escapeLikePattern(venueName)}%`)
        .gte('date', new Date().toISOString())
        .order('date', { ascending: true })
        .limit(20);

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!venueName,
    staleTime: 5 * 60 * 1000,
  });
}
