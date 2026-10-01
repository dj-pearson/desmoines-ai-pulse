import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';

const logger = createLogger('useViewTracking');

/**
 * Record a view of one event (WEB-QA-019).
 *
 * THIS USED TO FETCH TOO. Every EventCard mounted useViewTracking, which ran
 * get_content_view_stats in a raw useEffect: one uncached RPC per card per
 * mount, four on every event detail page's related rail alone. What it fetched
 * could never render. The only consumers were a "trending" badge and a "N views
 * in the last hour" badge, gated on recent_views and trending_score, and both
 * are always 0 because nothing records when a view happened (view_count is a
 * lifetime total; see migration 20260822000011). So the read and the two dead
 * badges are gone; recording the view stays.
 *
 * useRestaurantViewTracking went with it: it had no callers.
 */
export function useViewTracking(eventId: string) {
  const trackView = useCallback(async () => {
    const { error } = await supabase.rpc('increment_event_view', { event_id: eventId });
    if (error) {
      logger.debug('trackView', 'View tracking failed', { error: error.message });
    }
  }, [eventId]);

  return { trackView };
}

/**
 * Record an impression for several events at once, for list pages.
 *
 * The RPC caps the array at 200 and de-duplicates, so a repeated id in one batch
 * counts once.
 */
export async function batchTrackViews(eventIds: string[]) {
  if (eventIds.length === 0) return;

  const { error } = await supabase.rpc('batch_increment_views', { event_ids: eventIds });
  if (error) {
    logger.debug('batchTrackViews', 'Batch view tracking failed', { error: error.message });
  }
}
