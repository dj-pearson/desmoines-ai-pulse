import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { EVENT_LIST_COLUMNS, RESTAURANT_LIST_COLUMNS } from '@/lib/listColumns';
import { applyEventVisibility } from '@/lib/eventQuery';
import { sanitizePostgrestPattern } from '@/lib/postgrestPattern';
import { STALE_TIME } from '@/lib/queryConfig';
import { isVisitableStatus } from '@/lib/restaurantHours';
import { centralDateOf, centralWindow } from '@/lib/timezone';

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

/** The fields the trail reads to decide where a row goes. */
export interface BreweryLifecycleRow {
  status?: string | null;
}

/** Statuses that mean "not open yet", as opposed to closed for good. */
const UPCOMING_STATUSES = new Set(['opening_soon', 'announced', 'coming_soon']);

/**
 * The trail's rows, split by whether you can walk in today (WP4.8).
 *
 * The passport's "N of M" and "N to go" count `visitable` only: a place that
 * has not opened cannot be checked in at, so counting it made the passport
 * impossible to finish. `upcoming` renders in its own group with its dated
 * label. Anything else that is not visitable (a legacy closed spelling the
 * query's `status.neq.closed` let through) is on neither list.
 */
export function splitBreweries<T extends BreweryLifecycleRow>(rows: readonly T[]): { visitable: T[]; upcoming: T[] } {
  const visitable: T[] = [];
  const upcoming: T[] = [];
  for (const row of rows) {
    if (isVisitableStatus(row.status)) visitable.push(row);
    else if (UPCOMING_STATUSES.has((row.status ?? '').trim().toLowerCase())) upcoming.push(row);
  }
  return { visitable, upcoming };
}

/** Words a brewery's name carries that an event's venue text often leaves out. */
const VENUE_NOISE_WORDS = new Set(['company', 'co', 'llc', 'inc', 'taproom', 'brewpub']);

/**
 * A brewery name as an event's venue is likely to spell it (WP4.11).
 *
 * "Exile Brewing Company" is "Exile Brewing" on most listings, and a raw
 * ilike on the full name missed it. Punctuation goes, then "Company", "Co.",
 * "LLC", "Inc", "Taproom" and "Brewpub". What is left must be at least two
 * words: "Fox" alone would match the Fox Theatre. When stripping would leave
 * one word ("Confluence Taproom"), the full two-word name is kept; a one-word
 * name gives null and the brewery is left out of the venue match.
 */
export function breweryVenueName(name: string | null | undefined): string | null {
  const words = (name ?? '')
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 2) return null;
  const kept = words.filter((w) => !VENUE_NOISE_WORDS.has(w.toLowerCase()));
  if (kept.length >= 2) return kept.join(' ');
  // Stripping went too far; drop trailing noise words only while two remain.
  const trimmed = [...words];
  while (trimmed.length > 2 && VENUE_NOISE_WORDS.has(trimmed[trimmed.length - 1].toLowerCase())) trimmed.pop();
  return trimmed.join(' ');
}

/** Hours an event with a start time but no end is assumed to run, for hiding it once it is over. */
const ASSUMED_EVENT_HOURS = 3;

/**
 * False once an event is over (WP4.11). The strip reads the next seven Central
 * days from the start of today, so without this a 10 AM tasting was still
 * "this week" at 9 PM. An `end_date` decides when present. Otherwise a timed
 * event is over ASSUMED_EVENT_HOURS after it starts, and a date-only event at
 * the end of its Central day.
 */
export function breweryEventNotOver(
  event: { date?: string | null; end_date?: string | null; event_start_utc?: string | null },
  now: Date,
): boolean {
  const end = event.end_date ? Date.parse(event.end_date) : NaN;
  const startRaw = event.event_start_utc || event.date || null;
  const start = startRaw ? Date.parse(startRaw) : NaN;
  if (Number.isFinite(end) && (!Number.isFinite(start) || end >= start)) return end >= now.getTime();
  if (!Number.isFinite(start)) return true;
  const dateOnly = !event.event_start_utc && typeof event.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.date);
  if (dateOnly) return (event.date as string) >= centralDateOf(now);
  return start + ASSUMED_EVENT_HOURS * 3_600_000 >= now.getTime();
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
  end_date?: string | null;
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
  const venueNames = names.map(breweryVenueName).filter((n): n is string => n !== null);
  const clause = breweryVenueClause(venueNames);
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

/** Postgres unique_violation: the (user_id, restaurant_id) pair already exists. */
export const UNIQUE_VIOLATION = '23505';

export interface CheckinResult {
  /** True when the visit was already recorded and nothing was written. */
  alreadyCheckedIn: boolean;
}

/**
 * Record a first visit (WP4.9).
 *
 * An INSERT, not an upsert. The upsert on (user_id, restaurant_id) replaced
 * the first visit's date, beer and rating whenever a Check in button showed
 * for a place already visited - which is what a failed check-ins read used
 * to do. A 23505 now means "already checked in" and changes nothing.
 * Changing a visit is useUpdateCheckinMutation, by row id.
 */
export function useCheckinMutation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      restaurantId,
      beerName,
      rating,
    }: {
      restaurantId: string;
      beerName?: string;
      rating?: number;
    }): Promise<CheckinResult> => {
      if (!user) throw new Error('Must be logged in');
      const { error } = await supabase.from('brewery_trail_checkins').insert({
        user_id: user.id,
        restaurant_id: restaurantId,
        beer_name: beerName || null,
        rating: rating || null,
        checked_in_at: new Date().toISOString(),
      });
      if (error) {
        if (error.code === UNIQUE_VIOLATION) return { alreadyCheckedIn: true };
        throw error;
      }
      return { alreadyCheckedIn: false };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brewery-checkins'] });
    },
  });
}

/**
 * Change the beer or rating on a recorded visit, by the check-in's id, under
 * the existing "Users can update own checkins" policy (auth.uid() = user_id).
 * The visit date is left alone.
 */
export function useUpdateCheckinMutation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ checkinId, beerName, rating }: { checkinId: string; beerName?: string; rating?: number }) => {
      if (!user) throw new Error('Must be logged in');
      const { error } = await supabase
        .from('brewery_trail_checkins')
        .update({ beer_name: beerName || null, rating: rating || null })
        .eq('id', checkinId)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brewery-checkins'] });
    },
  });
}
