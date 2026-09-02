/**
 * Tracking utilities for ad impressions and clicks
 * Provides session management, device detection, and analytics logging
 */

import { supabase } from "@/integrations/supabase/client";
import { createLogger } from '@/lib/logger';
import { safeStorage } from '@/lib/safeStorage';

const logger = createLogger('tracking');

const SESSION_STORAGE_KEY = 'ad_session_id';
const SESSION_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds

/**
 * Get or create a session ID for tracking
 * Session expires after 30 minutes of inactivity
 */
export function getOrCreateSessionId(): string {
  const stored = safeStorage.getItem(SESSION_STORAGE_KEY);

  if (stored) {
    try {
      const { sessionId, timestamp } = JSON.parse(stored);
      const now = Date.now();

      // Check if session is still valid
      if (now - timestamp < SESSION_DURATION) {
        // Update timestamp to extend session
        safeStorage.setItem(
          SESSION_STORAGE_KEY,
          JSON.stringify({ sessionId, timestamp: now })
        );
        return sessionId;
      }
    } catch (e) {
      // Invalid stored data, create new session
    }
  }

  // Create new session
  const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  safeStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ sessionId: newSessionId, timestamp: Date.now() })
  );

  return newSessionId;
}

/**
 * Detect device type from user agent
 */
export function getDeviceType(): string {
  const ua = navigator.userAgent;

  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'tablet';
  }
  if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

/**
 * Detect browser from user agent
 */
export function getBrowser(): string {
  const ua = navigator.userAgent;

  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  if (ua.includes('MSIE') || ua.includes('Trident/')) return 'Internet Explorer';

  return 'Other';
}

/**
 * Hash IP address for privacy compliance
 * Note: IP address should be provided by server-side function
 */
export function hashIpAddress(ip: string): string {
  // Simple hash for demo - in production use a proper hashing algorithm
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

/**
 * Log an ad impression
 * Uses IntersectionObserver to track viewability (50% visible for 1 second)
 */
/**
 * Record that an ad was seen.
 *
 * WEB-ADS-002. This used to INSERT into ad_impressions from the browser. That
 * table has no INSERT policy in any migration, so RLS refused every write and
 * every advertiser dashboard showed zero for the life of the feature. The
 * insert now happens in the track-ad-event edge function on the service role,
 * which also drops crawler traffic and refuses to bill an inactive campaign.
 *
 * client_event_id makes a retry a no-op: without it a flaky network turned one
 * impression into several billable ones.
 */
export async function logImpression(
  campaignId: string,
  creativeId: string,
  placementType: string
): Promise<{ success: boolean; impressionId?: string; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('track-ad-event', {
      body: {
        kind: 'impression',
        campaign_id: campaignId,
        creative_id: creativeId,
        placement_type: placementType,
        session_id: getOrCreateSessionId(),
        client_event_id: crypto.randomUUID(),
        page_url: typeof window !== 'undefined' ? window.location.href : null,
        referrer_url: typeof document !== 'undefined' ? document.referrer || null : null,
      },
    });

    if (error) {
      logger.error('logImpression', 'Error logging impression', { error: error.message });
      return { success: false, error: error.message };
    }

    const result = data as { recorded?: boolean; id?: string | null } | null;
    return { success: !!result?.recorded, impressionId: result?.id ?? undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('logImpression', 'Error logging impression', { error: message });
    return { success: false, error: message };
  }
}

/**
 * Record that an ad was clicked. Server-side for the same reasons as
 * logImpression above (WEB-ADS-002).
 */
export async function logClick(
  campaignId: string,
  creativeId: string,
  impressionId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('track-ad-event', {
      body: {
        kind: 'click',
        campaign_id: campaignId,
        creative_id: creativeId,
        session_id: getOrCreateSessionId(),
        client_event_id: crypto.randomUUID(),
        impression_id: impressionId ?? null,
      },
    });

    if (error) {
      logger.error('logClick', 'Error logging click', { error: error.message });
      return { success: false, error: error.message };
    }

    return { success: !!(data as { recorded?: boolean } | null)?.recorded };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('logClick', 'Error logging click', { error: message });
    return { success: false, error: message };
  }
}

/*
 * shouldShowAd() lived here and is deleted (WEB-ADS-002).
 *
 * It SELECTed ad_impressions to count how often a campaign had been shown, and
 * that table has no policy in any migration, so the query returned nothing and
 * the function returned true every time. It capped nothing. Worse, it read as a
 * working control, which is why the real one was left switched off: useActiveAds
 * passed p_session_id: null and get_active_ads therefore skipped its own cap.
 *
 * The cap now lives in get_active_ads, which is where it can see every session's
 * impressions rather than the ones RLS happens to show the current visitor.
 * useActiveAds passes the session id, so it applies.
 */

/**
 * Track ad viewability using IntersectionObserver
 * Logs impression when ad is 50% visible for at least 1 second
 */
export function createViewabilityObserver(
  element: HTMLElement,
  onVisible: () => void,
  options?: {
    threshold?: number;
    minDuration?: number;
  }
): IntersectionObserver {
  const threshold = options?.threshold ?? 0.5; // 50% visible by default
  const minDuration = options?.minDuration ?? 1000; // 1 second by default

  let visibilityTimer: ReturnType<typeof setTimeout> | null = null;
  let hasTriggered = false;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.intersectionRatio >= threshold) {
          // Ad is visible above threshold
          if (!visibilityTimer && !hasTriggered) {
            visibilityTimer = setTimeout(() => {
              if (!hasTriggered) {
                hasTriggered = true;
                onVisible();
                observer.disconnect(); // Stop observing after first valid view
              }
            }, minDuration);
          }
        } else {
          // Ad is no longer visible or below threshold
          if (visibilityTimer) {
            clearTimeout(visibilityTimer);
            visibilityTimer = null;
          }
        }
      });
    },
    {
      threshold: [0, threshold, 1],
      rootMargin: '0px',
    }
  );

  observer.observe(element);
  return observer;
}

/**
 * Get analytics summary for a campaign
 * Aggregates impression and click data
 */

export async function getCampaignAnalytics(
  campaignId: string,
  startDate?: string,
  endDate?: string
): Promise<{
  totalImpressions: number;
  totalClicks: number;
  ctr: number;
  uniqueViewers: number;
  error?: string;
}> {
  try {
    let impressionQuery = supabase
      .from('ad_impressions')
      .select('id, session_id', { count: 'exact' })
      .eq('campaign_id', campaignId);

    if (startDate) {
      impressionQuery = impressionQuery.gte('date', startDate);
    }
    if (endDate) {
      impressionQuery = impressionQuery.lte('date', endDate);
    }

    const { data: impressions, count: impressionCount, error: impressionError } =
      await impressionQuery;

    if (impressionError) throw impressionError;

    let clickQuery = supabase
      .from('ad_clicks')
      .select('id', { count: 'exact' })
      .eq('campaign_id', campaignId);

    if (startDate) {
      clickQuery = clickQuery.gte('date', startDate);
    }
    if (endDate) {
      clickQuery = clickQuery.lte('date', endDate);
    }

    const { count: clickCount, error: clickError } = await clickQuery;

    if (clickError) throw clickError;

    const totalImpressions = impressionCount || 0;
    const totalClicks = clickCount || 0;
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

    // Count unique sessions as unique viewers
    const uniqueSessions = new Set(
      (impressions || []).map((imp: any) => imp.session_id)
    );
    const uniqueViewers = uniqueSessions.size;

    return {
      totalImpressions,
      totalClicks,
      ctr: parseFloat(ctr.toFixed(2)),
      uniqueViewers,
    };
  } catch (err) {
    logger.error('getCampaignAnalytics', 'Error getting campaign analytics', { error: err instanceof Error ? err.message : String(err) });
    return {
      totalImpressions: 0,
      totalClicks: 0,
      ctr: 0,
      uniqueViewers: 0,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
