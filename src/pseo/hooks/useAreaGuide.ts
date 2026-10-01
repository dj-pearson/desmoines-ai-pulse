/**
 * SEO-040 - the two reads behind PseoAreaGuide: places in a neighbourhood and
 * events inside its polygon. Pure shaping lives in ../areaGuide.ts.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { applyEventVisibility } from '@/lib/eventQuery';
import type { NeighborhoodBoundary } from '@/lib/neighborhoodBoundaries';
import {
  AREA_LOOKAHEAD_DAYS,
  polygonBounds,
  splitAreaEvents,
  splitAreaPlaces,
  type AreaEventRow,
  type AreaPlaceRow,
} from '../areaGuide';

const STALE_MS = 5 * 60 * 1000;

export function useAreaPlaces(boundary: NeighborhoodBoundary | undefined) {
  return useQuery({
    queryKey: ['pseo-area-places', boundary?.slug ?? 'none'],
    enabled: !!boundary,
    staleTime: STALE_MS,
    queryFn: async () => {
      if (!boundary) throw new Error('useAreaPlaces: no boundary');
      const { data, error } = await supabase
        .from('restaurants')
        .select('id, name, slug, cuisine, price_range, rating, status, latitude, longitude')
        .eq('neighborhood', boundary.slug)
        .neq('is_merged', true)
        .order('rating', { ascending: false, nullsFirst: false })
        .order('name', { ascending: true })
        .limit(100);
      if (error) throw error;
      return splitAreaPlaces((data ?? []) as AreaPlaceRow[]);
    },
  });
}

export function useAreaEvents(boundary: NeighborhoodBoundary | undefined) {
  return useQuery({
    queryKey: ['pseo-area-events', boundary?.slug ?? 'none'],
    enabled: !!boundary,
    staleTime: STALE_MS,
    queryFn: async () => {
      if (!boundary) throw new Error('useAreaEvents: no boundary');
      const now = new Date();
      const until = new Date(now.getTime() + AREA_LOOKAHEAD_DAYS * 86_400_000);
      const box = polygonBounds(boundary.polygon);
      const query = supabase
        .from('events')
        .select('id, title, date, event_start_utc, time_tbd, venue, location, latitude, longitude')
        .gte('date', now.toISOString())
        .lt('date', until.toISOString())
        .gte('latitude', box.minLat)
        .lte('latitude', box.maxLat)
        .gte('longitude', box.minLng)
        .lte('longitude', box.maxLng)
        .order('date', { ascending: true })
        .limit(100);
      const { data, error } = await applyEventVisibility(query);
      if (error) throw error;
      return splitAreaEvents((data ?? []) as AreaEventRow[], boundary.polygon, now);
    },
  });
}
