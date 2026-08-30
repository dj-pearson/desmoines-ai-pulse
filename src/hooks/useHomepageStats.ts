import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { handleError } from '@/lib/errorHandler';

/**
 * Counts behind the homepage trust strip (EnhancedHero's "N Events Today /
 * N Restaurants / N New This Week" tiles).
 *
 * WEB-QA-024 — three things this hook used to get wrong:
 *
 * 1. It counted events that /events refuses to show. useEvents.ts:59-60 filters
 *    .neq("is_merged", true).neq("is_hidden", true) per WEB-AUTO-005/006, and
 *    this hook filtered on date alone, so the tile and the page it links to
 *    disagreed by construction — the counter included merged duplicates and
 *    soft-hidden stale rows.
 * 2. It read `count ?? 0` and discarded the error, so a rejected query rendered
 *    a confident "0 Events Today" on the highest-traffic trust signal on the
 *    site. A wrong number a visitor believes is worse than a dash they don't.
 * 3. It was raw useState + useEffect with an empty dep array — no retry, no
 *    cache, no dedup, no isError — against the CLAUDE.md data-flow convention.
 *
 * Counts are `null`, never 0, when unknown. Callers must render that as
 * something other than a number.
 */
const TZ = 'America/Chicago';

export interface HomepageStats {
  eventsToday: number | null;
  restaurantsCount: number | null;
  newThisWeek: number | null;
  isLoading: boolean;
  isError: boolean;
}

interface HomepageCounts {
  eventsToday: number;
  restaurantsCount: number;
  newThisWeek: number;
}

/** Exported for the unit tests — see src/hooks/__tests__/useHomepageStats.test.ts. */
export async function fetchHomepageCounts(): Promise<HomepageCounts> {
  const now = new Date();
  const nowLocal = toZonedTime(now, TZ);

  // Today's date range in UTC (matching EventsToday.tsx logic)
  const startLocal = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate(), 0, 0, 0, 0);
  const endLocal = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate(), 23, 59, 59, 999);
  const todayStartUtc = fromZonedTime(startLocal, TZ).toISOString();
  const todayEndUtc = fromZonedTime(endLocal, TZ).toISOString();

  // 7 days ago for "new this week"
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoUtc = weekAgo.toISOString();

  const [eventsRes, restaurantsRes, newEventsRes] = await Promise.all([
    // Events happening today. The two .neq calls are the whole point of AC1 —
    // they must stay in step with useEvents.ts.
    supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .gte('date', todayStartUtc)
      .lte('date', todayEndUtc)
      .neq('is_merged', true)
      .neq('is_hidden', true),

    // All restaurants. NOTE: this tile links to /restaurants/open-now, which
    // shows a subset — the number and the destination have never matched. Left
    // as a total deliberately; changing what the number MEANS is a product
    // decision, not a bug fix (tracked separately).
    supabase
      .from('restaurants')
      .select('*', { count: 'exact', head: true }),

    // Events created in the last 7 days. Same visibility predicate, plus the
    // upcoming-only bound: the tile links to /events, and an event created two
    // days ago for a date that has already passed is not on that page.
    supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', weekAgoUtc)
      .gte('date', todayStartUtc)
      .neq('is_merged', true)
      .neq('is_hidden', true),
  ]);

  // Surface the first failure rather than substituting a zero for it.
  const failure = eventsRes.error ?? restaurantsRes.error ?? newEventsRes.error;
  if (failure) throw failure;

  return {
    eventsToday: eventsRes.count ?? 0,
    restaurantsCount: restaurantsRes.count ?? 0,
    newThisWeek: newEventsRes.count ?? 0,
  };
}

export function useHomepageStats(): HomepageStats {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['homepage-stats'],
    queryFn: fetchHomepageCounts,
    // Counts move on a scale of hours, and this fires on every homepage view.
    staleTime: 5 * 60 * 1000,
  });

  // In an effect, not the render body: React Query keeps `error` set until the
  // query succeeds, so reporting inline would re-fire on every re-render.
  useEffect(() => {
    if (error) {
      handleError(error, { component: 'useHomepageStats', action: 'fetchHomepageCounts' });
    }
  }, [error]);

  return {
    eventsToday: data?.eventsToday ?? null,
    restaurantsCount: data?.restaurantsCount ?? null,
    newThisWeek: data?.newThisWeek ?? null,
    isLoading,
    isError,
  };
}
