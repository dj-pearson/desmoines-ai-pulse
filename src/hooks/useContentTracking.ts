import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';
import { hasConsent } from '@/components/CookieConsentBanner';

const log = createLogger('useContentTracking');

type ContentType = 'event' | 'restaurant' | 'attraction';
type MetricType = 'view' | 'favorite' | 'share' | 'click';

/**
 * Fire-and-forget content interaction tracker for the event, restaurant and
 * attraction detail pages.
 *
 * WHY THE EDGE FUNCTION AND NOT A DIRECT INSERT (WEB-SEC-021 AC6)
 * This used to call `supabase.from('content_metrics').insert(...)` directly.
 * That has never once succeeded. content_metrics has no INSERT policy for
 * anon or authenticated, so every write returned
 *   42501  new row violates row-level security policy for table "content_metrics"
 * and the only handling was a `log.warn`, which esbuild strips from production
 * builds. The evidence is in the table itself: all 21,778 rows are
 * metric_type='view', written by the log-content-metrics edge function. There
 * is not a single 'share', 'click' or 'favorite' row, because this hook is the
 * only thing that produces those and it could not write.
 *
 * log-content-metrics runs verify_jwt=false precisely so anonymous visitors can
 * be counted, and it holds the service-role key behind a rate limit, a batch
 * cap, a metric_value clamp and an enum allowlist (WEB-SEC-022). That is the
 * supported way in, and useAnalytics already uses it.
 *
 * Engagement tracking is non-essential, so it stays gated on the user's
 * "analytics" cookie consent (opt-out by default; GPC honored). Without
 * consent, tracking is a no-op.
 */
export function useContentTracking(contentId: string | undefined, contentType: ContentType) {
  const trackedViewRef = useRef(false);

  const trackEvent = useCallback(
    (metricType: MetricType) => {
      if (!contentId) return;
      if (!hasConsent('analytics')) return;

      // Not awaited: tracking must never block or fail the UI. The function
      // aggregates by (content_type, content_id, metric_type, date, hour)
      // server-side, so the client does not send date or hour.
      void supabase.functions
        .invoke('log-content-metrics', {
          body: {
            events: [
              {
                content_type: contentType,
                content_id: contentId,
                metric_type: metricType,
                metric_value: 1,
              },
            ],
          },
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
