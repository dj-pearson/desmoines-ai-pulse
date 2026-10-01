import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { STALE_TIME, GC_TIME } from '@/lib/queryConfig';
import { EVENT_LIST_COLUMNS, RESTAURANT_LIST_COLUMNS, ATTRACTION_LIST_COLUMNS } from '@/lib/listColumns';
import { sanitizePostgrestPattern } from '@/lib/postgrestPattern';
import { createLogger } from '@/lib/logger';
import type { Neighborhood } from '@/lib/neighborhoods';
import type { Event } from '@/lib/types';

const logger = createLogger('useNeighborhoodContent');

/** Cards render at most this many per tab; the counts are of what matched. */
const PER_TAB = 12;

export interface NeighborhoodRestaurant {
  id: string;
  name: string;
  slug: string | null;
  cuisine: string | null;
  location: string | null;
  image_url: string | null;
  price_range: string | null;
  rating: number | null;
}

export interface NeighborhoodAttraction {
  id: string;
  name: string;
  type: string | null;
  location: string | null;
  address: string | null;
  image_url: string | null;
  rating: number | null;
}

export interface NeighborhoodContent {
  events: Event[];
  restaurants: NeighborhoodRestaurant[];
  attractions: NeighborhoodAttraction[];
  total: number;
}

/**
 * Build `col.ilike.%term%` clauses for every (column, matchTerm) pair.
 *
 * PostgREST parses a comma as the end of a clause inside or(...) and `*` as its
 * ilike wildcard, so every term goes through sanitizePostgrestPattern first -
 * "Ankeny, IA" is not an exotic input for a place name (see that module's
 * header for the production 400s this prevents).
 */
function ilikeAny(columns: string[], terms: string[]): string {
  const safe = terms.map((t) => sanitizePostgrestPattern(t)).filter(Boolean);
  return columns.flatMap((col) => safe.map((t) => `${col}.ilike.%${t}%`)).join(',');
}

/**
 * Events, restaurants and attractions matching a neighborhood (WEB-SEO-036).
 *
 * WHY ilike AND NOT A GEO RADIUS. Seven of the eight entries are CITIES, and a
 * city name is what actually sits in events.city, events.location and the
 * restaurant/attraction location columns. A radius would need every row
 * geocoded, and WEB-BE-050 records that geocoding at ingest is mostly absent -
 * so a radius query would silently return less than the text match, not more.
 * East Village is the one district inside Des Moines and matches on its
 * landmarks instead; that is why matchTerms is a list rather than the name.
 *
 * THE MATCH IS NOT VERIFIED AGAINST PRODUCTION. This container has no Supabase
 * credentials, so what these columns actually hold could not be probed. That is
 * exactly why NEIGHBORHOOD_MIN_ITEMS exists: a match that finds nothing takes
 * the page out of the index rather than shipping the shell to a crawler. Check
 * the real counts before removing that gate.
 *
 * One useQuery rather than three, because the page's noindex decision needs the
 * TOTAL across all three - three separate queries would let the page render and
 * decide twice.
 */
export function useNeighborhoodContent(neighborhood: Neighborhood | undefined) {
  return useQuery<NeighborhoodContent>({
    queryKey: ['neighborhood-content', neighborhood?.slug ?? 'none'],
    enabled: !!neighborhood,
    staleTime: STALE_TIME.CONTENT_LIST,
    gcTime: GC_TIME,
    queryFn: async () => {
      if (!neighborhood) throw new Error('useNeighborhoodContent: no neighborhood');
      const terms = neighborhood.matchTerms;
      const nowIso = new Date().toISOString();

      const [eventsRes, restaurantsRes, attractionsRes] = await Promise.all([
        supabase
          .from('events')
          .select(EVENT_LIST_COLUMNS)
          .or(ilikeAny(['city', 'location', 'venue'], terms))
          .gte('event_start_utc', nowIso)
          .order('event_start_utc', { ascending: true })
          .limit(PER_TAB),
        supabase
          .from('restaurants')
          .select(RESTAURANT_LIST_COLUMNS)
          .or(ilikeAny(['city', 'location'], terms))
          .order('popularity_score', { ascending: false, nullsFirst: false })
          .limit(PER_TAB),
        supabase
          .from('attractions')
          .select(ATTRACTION_LIST_COLUMNS)
          .or(ilikeAny(['location', 'address'], terms))
          .eq('is_active', true)
          .order('rating', { ascending: false, nullsFirst: false })
          .limit(PER_TAB),
      ]);

      // A dropped error here is the false-empty-state shape this repo keeps
      // finding: the page would noindex itself and say "nothing here" when the
      // truth is that the request failed. Raise, and let TanStack retry.
      for (const [label, res] of [
        ['events', eventsRes],
        ['restaurants', restaurantsRes],
        ['attractions', attractionsRes],
      ] as const) {
        if (res.error) {
          logger.error('fetch', `Failed to load ${label} for ${neighborhood.slug}`, {
            error: res.error,
          });
          throw res.error;
        }
      }

      const events = (eventsRes.data ?? []) as unknown as Event[];
      const restaurants = (restaurantsRes.data ?? []) as unknown as NeighborhoodRestaurant[];
      const attractions = (attractionsRes.data ?? []) as unknown as NeighborhoodAttraction[];

      return {
        events,
        restaurants,
        attractions,
        total: events.length + restaurants.length + attractions.length,
      };
    },
  });
}
