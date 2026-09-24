import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { EVENT_LIST_COLUMNS, RESTAURANT_LIST_COLUMNS } from '@/lib/listColumns';
import { applyEventVisibility } from '@/lib/eventQuery';
import { sanitizePostgrestPattern } from '@/lib/postgrestPattern';
import { STALE_TIME } from '@/lib/queryConfig';
import { centralWindow } from '@/lib/timezone';

export interface BreweryCheckin {
  id: string;
  user_id: string;
  restaurant_id: string;
  checked_in_at: string;
  photo_url: string | null;
  beer_name: string | null;
  rating: number | null;
}

/**
 * WHY THIS LIST STILL EXISTS (WEB-PERF-035 AC3).
 *
 * A trail built from nine hardcoded names is wrong in both directions: a new
 * brewery is invisible until someone edits this file, and a restaurant that
 * happens to contain one of these strings joins the trail. The fix is a column,
 * and supabase/migrations/20260919000007_restaurants_is_brewery.sql adds
 * `restaurants.is_brewery` and backfills it from exactly these two signals.
 *
 * The READER cannot switch in the same release. Cloudflare Pages deploys on
 * push to main while migrations are applied by hand, so a hook filtering on
 * `is_brewery` before that migration lands gets 42703 from PostgREST - which
 * rejects the WHOLE select, blanking the trail rather than degrading it
 * (CLAUDE.md, Backward Compatibility). Switch this to
 * `.eq('is_brewery', true)` in the release AFTER the migration is live, and
 * delete the list then.
 */
const BREWERY_NAMES = [
  'Confluence Brewing',
  'Exile Brewing',
  'Peace Tree Brewing',
  'Firetrucker Brewery',
  'Brightside Aleworks',
  '515 Brewing',
  'Mistress Brewing',
  'Fox Brewing',
  'Kinship Brewing',
];

export function useBreweries() {
  return useQuery({
    queryKey: ['breweries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restaurants')
        .select(RESTAURANT_LIST_COLUMNS)
        // Merged duplicates and closed places are not on the trail, and must
        // not count toward the passport's "N of M" denominator either.
        // status is nullable and neq('status', 'closed') would also drop the
        // NULL rows, so "not closed" is an OR that keeps them, nested with the
        // name match in one `or=` param.
        .neq('is_merged', true)
        .or(
          `and(or(status.is.null,status.neq.closed),or(${
            BREWERY_NAMES.map(n => `name.ilike.%${n}%`).join(',') + ',cuisine.ilike.%Brewery%,cuisine.ilike.%Craft Beer%'
          }))`,
        )
        .order('name');

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 10 * 60 * 1000,
  });
}

/** Most taproom events the strip shows. */
export const BREWERY_EVENTS_LIMIT = 12;

/**
 * The `or` clause matching an event's venue against any brewery name.
 *
 * Names come from restaurant rows, which are scraped, so each one goes through
 * sanitizePostgrestPattern: a comma or parenthesis in a name would otherwise
 * end the clause and 400 the request. Names that sanitise to nothing are
 * dropped, and duplicates collapse. Returns null when no name is left, and the
 * caller makes no request.
 */
export function breweryVenueClause(names: readonly string[]): string | null {
  const patterns = Array.from(
    new Set(names.map((n) => sanitizePostgrestPattern(n ?? '')).filter((p) => p.length >= 3)),
  ).sort();
  if (patterns.length === 0) return null;
  return patterns.map((p) => `venue.ilike.%${p}%`).join(',');
}

export interface BreweryEvent {
  id: string;
  title: string;
  date: string;
  venue: string | null;
  event_start_utc?: string | null;
  event_start_local?: string | null;
  [key: string]: unknown;
}

/**
 * This week's events at the trail's breweries: ONE request for every brewery,
 * not one per card. The next seven Central days, with the same visibility
 * predicates every events read uses (merged, hidden, archived).
 */
export function useBreweryEvents(names: readonly string[]) {
  const clause = breweryVenueClause(names);
  return useQuery({
    queryKey: ['brewery-events', clause],
    enabled: clause !== null,
    staleTime: STALE_TIME.CONTENT_LIST,
    queryFn: async (): Promise<BreweryEvent[]> => {
      if (!clause) return [];
      const range = centralWindow('next-7-days');
      const query = supabase
        .from('events')
        .select(EVENT_LIST_COLUMNS)
        .gte('date', range.start)
        .lte('date', range.end);
      const { data, error } = await applyEventVisibility(query)
        .or(clause)
        .order('date', { ascending: true })
        .limit(BREWERY_EVENTS_LIMIT);
      if (error) throw error;
      return (data ?? []) as unknown as BreweryEvent[];
    },
  });
}

export function useBreweryCheckins() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['brewery-checkins', user?.id],
    queryFn: async (): Promise<BreweryCheckin[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('brewery_trail_checkins')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;
      return (data ?? []) as unknown as BreweryCheckin[];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCheckinMutation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ restaurantId, beerName, rating }: { restaurantId: string; beerName?: string; rating?: number }) => {
      if (!user) throw new Error('Must be logged in');
      const { data, error } = await supabase
        .from('brewery_trail_checkins')
        .upsert({
          user_id: user.id,
          restaurant_id: restaurantId,
          beer_name: beerName || null,
          rating: rating || null,
          checked_in_at: new Date().toISOString(),
        }, { onConflict: 'user_id,restaurant_id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brewery-checkins'] });
    },
  });
}
