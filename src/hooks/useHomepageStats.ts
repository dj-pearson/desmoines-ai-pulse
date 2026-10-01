import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { handleError } from '@/lib/errorHandler';
import { applyEventVisibility } from '@/lib/eventQuery';
import { centralDateOf, centralHour, centralWindow } from '@/lib/timezone';

/**
 * The one count in the hero's context line: "Friday: N events today", or after
 * 15:00 Central "N still to start tonight" (home-pass2 WP1 items 4 and 13).
 *
 * It used to feed three desktop tiles as well (restaurants, new this week).
 * Those tiles are gone, and with them two first-view requests.
 *
 * Rules this keeps (WEB-QA-024):
 * - The count uses the site's visibility predicate (applyEventVisibility), so
 *   the number and /events/today, the page it links to, agree.
 * - The window is centralWindow('today'), the same Central day that page lists.
 * - A failed count, or a response with no count, THROWS. `count ?? 0` is how
 *   an outage used to render a confident "0 events today".
 *
 * Counts are `null` when unknown, never 0. Callers render that as a dash.
 */

/** From this Central hour the line counts only what has not started yet. */
export const STILL_TO_START_HOUR = 15;

/**
 * `today`: every visible event on today's Central date.
 * `still-to-start`: the ones from now to the end of today.
 */
export type TodayCountMode = 'today' | 'still-to-start';

export function todayCountMode(now: Date = new Date()): TodayCountMode {
  return centralHour(now) >= STILL_TO_START_HOUR ? 'still-to-start' : 'today';
}

export interface TodayCount {
  count: number;
  mode: TodayCountMode;
}

export interface HomepageStats {
  eventsToday: number | null;
  mode: TodayCountMode;
  isLoading: boolean;
  isError: boolean;
}

/** Exported for the unit tests: src/hooks/__tests__/useHomepageStats.test.ts. */
export async function fetchHomepageCounts(now: Date = new Date()): Promise<TodayCount> {
  const today = centralWindow('today', now);
  const mode = todayCountMode(now);
  const floor = mode === 'still-to-start' ? now.toISOString() : today.start;

  const { count, error } = await applyEventVisibility(
    supabase.from('events').select('id', { count: 'exact', head: true }),
  )
    .gte('date', floor)
    .lte('date', today.end);

  if (error) throw error;
  if (typeof count !== 'number') {
    throw new Error('events count came back without a count');
  }
  return { count, mode };
}

export function useHomepageStats(): HomepageStats {
  // Keyed on the Central day and the mode, so the line rolls over at 15:00 and
  // at midnight on the next refetch instead of keeping yesterday's number.
  const { day, mode } = useMemo(() => {
    const now = new Date();
    return { day: centralDateOf(now), mode: todayCountMode(now) };
  }, []);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['homepage-stats', day, mode],
    queryFn: () => fetchHomepageCounts(),
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
    eventsToday: data?.count ?? null,
    mode: data?.mode ?? mode,
    isLoading,
    isError,
  };
}
