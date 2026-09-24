import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { EventLiveStats } from './useEventSocial';
import { createLogger } from '@/lib/logger';

const log = createLogger('useBatchEventSocial');

/** The live-stats columns a card reads, and nothing else. */
export type BatchLiveStats = Pick<EventLiveStats, 'event_id' | 'total_checkins' | 'current_attendees'>;

/**
 * What a list card needs to show social proof: a count and the live stats.
 *
 * Counts only (docs/page-plans/events.md WP3 item 4). This used to carry every
 * public attendee row, user_id included, and up to 50 discussion messages per
 * event, for a card that prints "12 interested" and never reads a message.
 * A server-side counts RPC (deferred D3) replaces the attendee select later.
 */
export interface BatchEventSocialData {
  attendeeCount: number;
  liveStats: BatchLiveStats | null;
}

export interface BatchEventSocialResult {
  [eventId: string]: BatchEventSocialData;
}

/**
 * An entry for every id. A card that finds its entry trusts it and does NOT
 * fall back to its own per-event fetch, so the map must be complete even when
 * the batch failed; `{}` on error reinstated the N+1 this hook removes
 * (WEB-PERF-024).
 */
export function emptyBatchResult(eventIds: readonly string[]): BatchEventSocialResult {
  const result: BatchEventSocialResult = {};
  for (const id of eventIds) {
    result[id] = { attendeeCount: 0, liveStats: null };
  }
  return result;
}

export async function fetchBatchEventSocial(eventIds: readonly string[]): Promise<BatchEventSocialResult> {
  const result = emptyBatchResult(eventIds);
  if (eventIds.length === 0) return result;
  const ids = [...eventIds];

  try {
    // Both requests start together; they don't depend on each other.
    const [attendeesRes, statsRes] = await Promise.all([
      supabase
        .from('event_attendees')
        .select('event_id')
        .in('event_id', ids)
        .eq('visibility', 'public'),
      supabase
        .from('event_live_stats')
        .select('event_id,total_checkins,current_attendees')
        .in('event_id', ids),
    ]);

    // A failed batch is logged, not thrown: the page still renders its cards,
    // just without counts, and each card keeps its initialized entry.
    const batchErrors = [
      attendeesRes.error && `attendees: ${attendeesRes.error.message}`,
      statsRes.error && `live stats: ${statsRes.error.message}`,
    ].filter(Boolean);
    if (batchErrors.length > 0) {
      log.error('useBatchEventSocial', 'Batch social query failed', { eventCount: ids.length, batchErrors });
    }

    for (const row of attendeesRes.data ?? []) {
      const entry = result[row.event_id];
      if (entry) entry.attendeeCount += 1;
    }
    for (const row of statsRes.data ?? []) {
      const entry = result[row.event_id];
      if (entry) entry.liveStats = row;
    }
    return result;
  } catch (error) {
    log.error('fetchBatch', 'Error fetching batch event social data', { error });
    return emptyBatchResult(eventIds);
  }
}

/**
 * Social counts for a list of events in two parallel requests, instead of
 * several per card.
 *
 * The key has no user id: nothing fetched here depends on who is signed in,
 * and keying on it refetched every list on login.
 */
export function useBatchEventSocial(eventIds: string[]) {
  // Sorted copy: sorting the caller's array in place reordered a memoized list.
  const key = [...eventIds].sort().join(',');

  return useQuery({
    queryKey: ['batch-event-social', key],
    queryFn: () => fetchBatchEventSocial(eventIds),
    staleTime: 2 * 60 * 1000, // 2 minutes - social data changes frequently
    gcTime: 5 * 60 * 1000, // 5 minutes
    enabled: eventIds.length > 0,
  });
}
