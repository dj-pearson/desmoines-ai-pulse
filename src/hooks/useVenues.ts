import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EVENT_LIST_COLUMNS } from '@/lib/listColumns';
import { queryKeys } from '@/lib/queryKeys';
import { escapeLikePattern } from '@/lib/postgrestPattern';
import { applyEventVisibility } from '@/lib/eventQuery';

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
      // Explore plan WP5 item 1: merged, hidden and archived rows stay off
      // the venue page, the same rule every other reader applies.
      const { data, error } = await applyEventVisibility(
        supabase.from('events').select(EVENT_LIST_COLUMNS)
      )
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

export interface VenueLink {
  slug: string;
  name: string;
}

/**
 * Just the two columns a link needs, for below-the-fold directories such as the
 * /events hub (events plan WP7). useVenues() pulls every column for pages that
 * render venue details; a list of links has no use for descriptions, images or
 * coordinates. Appended after the other hooks so the select-star baseline's
 * line numbers above stay put.
 */
export function useVenueLinks() {
  return useQuery({
    queryKey: ['venues', 'links'],
    queryFn: async (): Promise<VenueLink[]> => {
      const { data, error } = await supabase
        .from('venues')
        .select('slug, name')
        .order('name');

      if (error) throw error;
      return ((data ?? []) as VenueLink[]).filter((v) => Boolean(v.slug && v.name));
    },
    staleTime: 10 * 60 * 1000,
  });
}
