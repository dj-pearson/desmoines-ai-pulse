import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  EVENT_LIST_COLUMNS,
  RESTAURANT_LIST_COLUMNS,
  ATTRACTION_LIST_COLUMNS,
} from '@/lib/listColumns';
import { STALE_TIME } from '@/lib/queryConfig';

/**
 * WEB-SEO-036: the real rows behind a neighborhood page.
 *
 * NeighborhoodPage.tsx shipped with `// Mock data - replace with actual API
 * calls`, an empty `events` array it then filtered, and `restaurants: []` and
 * `attractions: []` written out as literals - while still emitting LocalSEO
 * copy promising "the best events, restaurants, and attractions in <name>".
 * Four of those pages were prerendered and sitemapped, so what Google fetched
 * was a 512-element shell making a promise nothing on the page could keep.
 *
 * MATCHING IS BY NAME, not by boundary. We hold no neighborhood polygons and
 * no neighborhood column, so the only honest join is the text a row already
 * carries: an event's location or venue, a restaurant's location or city, an
 * attraction's location. `ilike` with the name is a coarse filter and it is
 * applied SERVER-side - the previous code filtered client-side over an array
 * that was always empty, which is a filter that can only ever return nothing.
 *
 * A neighborhood that matches nothing returns nothing. The page above turns
 * that into noindex rather than into filler; see the thin-content guard there.
 */
export interface NeighborhoodContent {
  events: Record<string, unknown>[];
  restaurants: Record<string, unknown>[];
  attractions: Record<string, unknown>[];
  total: number;
}

/** Rows to pull per surface. Three tabs of cards, not a full hub listing. */
const PER_SURFACE = 12;

export function useNeighborhoodContent(name: string | undefined) {
  return useQuery<NeighborhoodContent>({
    queryKey: ['neighborhood-content', name],
    enabled: Boolean(name),
    staleTime: STALE_TIME.CONTENT_LIST,
    queryFn: async () => {
      const term = `%${name}%`;
      const nowIso = new Date().toISOString();

      const [events, restaurants, attractions] = await Promise.all([
        supabase
          .from('events')
          .select(EVENT_LIST_COLUMNS)
          .or(`location.ilike.${term},venue.ilike.${term}`)
          .gte('date', nowIso)
          .order('event_start_utc', { ascending: true, nullsFirst: false })
          .limit(PER_SURFACE),
        supabase
          .from('restaurants')
          .select(RESTAURANT_LIST_COLUMNS)
          .or(`location.ilike.${term},city.ilike.${term}`)
          .order('popularity_score', { ascending: false, nullsFirst: false })
          .limit(PER_SURFACE),
        supabase
          .from('attractions')
          .select(ATTRACTION_LIST_COLUMNS)
          .ilike('location', term)
          // is_active, for the same reason WEB-SEO-037 wants it in the sitemap:
          // the hubs hide inactive rows, so a neighborhood page must not show
          // what /attractions will not.
          .eq('is_active', true)
          .order('rating', { ascending: false, nullsFirst: false })
          .limit(PER_SURFACE),
      ]);

      // One failed surface must not blank the other two, so each error is
      // thrown only if ALL three failed - otherwise the page renders what it
      // has and the guard below counts what actually arrived.
      if (events.error && restaurants.error && attractions.error) {
        throw events.error;
      }

      const eventRows = (events.data ?? []) as Record<string, unknown>[];
      const restaurantRows = (restaurants.data ?? []) as Record<string, unknown>[];
      const attractionRows = (attractions.data ?? []) as Record<string, unknown>[];

      return {
        events: eventRows,
        restaurants: restaurantRows,
        attractions: attractionRows,
        total: eventRows.length + restaurantRows.length + attractionRows.length,
      };
    },
  });
}

/**
 * Below this, the page is not worth submitting to an index.
 *
 * Mirrors the pSEO inventory gate (WEB-SEO-013): a page that cannot show five
 * things is a page that promises more than it has, and a thin page is a
 * liability across the whole domain rather than a neutral one.
 */
export const NEIGHBORHOOD_MIN_ITEMS = 5;
