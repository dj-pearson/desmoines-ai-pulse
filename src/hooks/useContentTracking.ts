import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';
import { hasConsent } from '@/components/CookieConsentBanner';

const log = createLogger('useContentTracking');

type ContentType = 'event' | 'restaurant' | 'attraction';
type MetricType = 'view' | 'favorite' | 'share' | 'click';

/**
 * Fire-and-forget content interaction tracker.
 *
 * Inserts rows into the `content_metrics` table so the admin
 * analytics dashboard has real engagement data.  Errors are
 * silently logged — tracking must never block the UI.
 *
 * Engagement tracking is non-essential, so it is gated on the user's
 * "analytics" cookie consent (opt-out by default; GPC honored). Without
 * consent, tracking is a no-op.
 */
export function useContentTracking(contentId: string | undefined, contentType: ContentType) {
  const trackedViewRef = useRef(false);

  const trackEvent = useCallback(
    (metricType: MetricType) => {
      if (!contentId) return;
      if (!hasConsent('analytics')) return;

      const now = new Date();

      supabase
        .from('content_metrics')
        .insert({
          content_id: contentId,
          content_type: contentType,
          metric_type: metricType,
          metric_value: 1,
          date: now.toISOString().split('T')[0],
          hour: now.getHours(),
        })
        .then(({ error }) => {
          if (error) {
            log.warn('trackEvent', `Failed to track ${metricType} for ${contentType}`, {
              contentId,
              error: error.message,
            });
          }
        });
    },
    [contentId, contentType],
  );

  // Automatically track a view once when the content loads
  useEffect(() => {
    if (contentId && !trackedViewRef.current) {
      trackedViewRef.current = true;
      trackEvent('view');
    }
  }, [contentId, trackEvent]);

  const trackFavorite = useCallback(() => trackEvent('favorite'), [trackEvent]);
  const trackShare = useCallback(() => trackEvent('share'), [trackEvent]);
  const trackClick = useCallback(() => trackEvent('click'), [trackEvent]);

  return { trackEvent, trackFavorite, trackShare, trackClick };
}
