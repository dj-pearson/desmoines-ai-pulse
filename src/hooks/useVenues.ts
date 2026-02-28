import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
    queryKey: ['venue-events', venueName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .ilike('venue', `%${venueName}%`)
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
