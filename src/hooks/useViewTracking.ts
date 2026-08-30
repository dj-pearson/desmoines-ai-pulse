import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';

const logger = createLogger('useViewTracking');

interface ViewCount {
  total_views: number;
  /** Views in the last 24h. Always 0 today - see the note on ZERO IS THE HONEST
   *  ANSWER below. */
  recent_views: number;
  /** Weighted trending score. Always 0 today, same reason. */
  trending_score: number;
}

const EMPTY: ViewCount = { total_views: 0, recent_views: 0, trending_score: 0 };

/**
 * View counts for an entity (WEB-QA-019 AC2).
 *
 * WHAT THIS USED TO DO. It read an `event_analytics` table that does not exist
 * -- 42P01 on every call -- and on failure fell through to generateFallbackData,
 * which hashed the entity id into a number between 50 and 250, called 30% of it
 * "recent views" and derived a "trending score" from it. EventCard renders
 * `ViewCountBadge ... timeframe="last hour"` when recent_views > 20 and a
 * trending badge when trending_score > 70, so a large share of event cards had
 * been showing real users invented social proof. The true number was 0: three
 * increment RPCs were missing (PGRST202) and events.view_count was 0 across all
 * 1,246 rows.
 *
 * WEB-QA-019 AC1 offers "implement it, or remove the call and its fallback
 * path". This does both -- the RPCs exist as of migration 20260822000011, and
 * the fabricating fallback is gone.
 *
 * ZERO IS THE HONEST ANSWER for recency, not a stub left to fill in. Nothing
 * records WHEN a view happened: view_count is a lifetime total with no per-view
 * log behind it. content_metrics looked like a source until it was measured --
 * 23,160 of its rows are content_type='page' against 16 'event', none in the
 * last 24 hours. So both badges stay unrendered, which is correct: a badge
 * claiming "42 views in the last hour" has to be backed by 42 views in the last
 * hour.
 */
export function useViewTracking(eventId: string) {
  const [viewData, setViewData] = useState<ViewCount>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function fetchViewCount() {
      const { data, error } = await supabase.rpc('get_content_view_stats', {
        p_content_type: 'event',
        p_content_id: eventId,
      });

      if (!active) return;

      if (error) {
        // Show nothing rather than something invented. The badges are gated on
        // non-zero values, so an outage hides them instead of guessing.
        logger.debug('fetchViewCount', 'View stats unavailable', { error: error.message });
        setViewData(EMPTY);
      } else {
        const row = Array.isArray(data) ? data[0] : data;
        setViewData({
          total_views: row?.total_views ?? 0,
          recent_views: row?.recent_views_24h ?? 0,
          trending_score: Number(row?.trending_score ?? 0),
        });
      }
      setIsLoading(false);
    }

    fetchViewCount();
    return () => {
      active = false;
    };
  }, [eventId]);

  const trackView = useCallback(async () => {
    const { error } = await supabase.rpc('increment_event_view', { event_id: eventId });

    if (error) {
      logger.debug('trackView', 'View tracking failed', { error: error.message });
      return;
    }

    setViewData((prev) => ({ ...prev, total_views: prev.total_views + 1 }));
  }, [eventId]);

  return { viewData, trackView, isLoading };
}

/**
 * View counts for a restaurant. Same shape and the same honesty rule as
 * useViewTracking above.
 */
export function useRestaurantViewTracking(restaurantId: string) {
  const [viewData, setViewData] = useState<ViewCount>(EMPTY);

  useEffect(() => {
    let active = true;

    async function fetchViewCount() {
      const { data, error } = await supabase.rpc('get_content_view_stats', {
        p_content_type: 'restaurant',
        p_content_id: restaurantId,
      });

      if (!active) return;

      if (error) {
        logger.debug('fetchRestaurantViews', 'View stats unavailable', { error: error.message });
        setViewData(EMPTY);
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;
      setViewData({
        total_views: row?.total_views ?? 0,
        recent_views: row?.recent_views_24h ?? 0,
        trending_score: Number(row?.trending_score ?? 0),
      });
    }

    fetchViewCount();
    return () => {
      active = false;
    };
  }, [restaurantId]);

  const trackView = useCallback(async () => {
    const { error } = await supabase.rpc('increment_restaurant_view', {
      restaurant_id: restaurantId,
    });

    if (error) {
      logger.debug('trackRestaurantView', 'View tracking failed', { error: error.message });
      return;
    }

    setViewData((prev) => ({ ...prev, total_views: prev.total_views + 1 }));
  }, [restaurantId]);

  return { viewData, trackView };
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
