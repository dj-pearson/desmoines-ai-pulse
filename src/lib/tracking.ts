/**
 * Tracking utilities for ad impressions and clicks
 * Provides session management, device detection, and analytics logging
 */

import { supabase } from "@/integrations/supabase/client";
import { createLogger } from '@/lib/logger';

const logger = createLogger('tracking');

const SESSION_STORAGE_KEY = 'ad_session_id';
const SESSION_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds

/**
 * Get or create a session ID for tracking
 * Session expires after 30 minutes of inactivity
 */
export function getOrCreateSessionId(): string {
  const stored = localStorage.getItem(SESSION_STORAGE_KEY);

  if (stored) {
    try {
      const { sessionId, timestamp } = JSON.parse(stored);
      const now = Date.now();

      // Check if session is still valid
      if (now - timestamp < SESSION_DURATION) {
        // Update timestamp to extend session
        localStorage.setItem(
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
  localStorage.setItem(
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
export async function logImpression(
  campaignId: string,
  creativeId: string,
  placementType: string
): Promise<{ success: boolean; impressionId?: string; error?: string }> {
  try {
    const sessionId = getOrCreateSessionId();
    const deviceType = getDeviceType();
    const browser = getBrowser();

    // Get current user if authenticated
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('ad_impressions')
      .insert({
        campaign_id: campaignId,
        creative_id: creativeId,
        placement_type: placementType,
        user_id: user?.id || null,
        session_id: sessionId,
        user_agent: navigator.userAgent,
        page_url: window.location.href,
        referrer_url: document.referrer || null,
        device_type: deviceType,
        browser: browser,
        date: new Date().toISOString().split('T')[0],
      })
      .select('id')
      .single();

    if (error) {
      logger.error('logImpression', 'Error logging impression', { error: error.message });
      return { success: false, error: error.message };
    }

    return { success: true, impressionId: data.id };
  } catch (err) {
    logger.error('logImpression', 'Error logging impression', { error: err instanceof Error ? err.message : String(err) });
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }
}

/**
 * Log an ad click
 * Links to the most recent impression from this session
 */
export async function logClick(
  campaignId: string,
  creativeId: string,
  impressionId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // If no impression ID provided, try to find the most recent impression
    let linkedImpressionId = impressionId;

    if (!linkedImpressionId) {
      const sessionId = getOrCreateSessionId();
      const { data: impressions } = await supabase
        .from('ad_impressions')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('creative_id', creativeId)
        .eq('session_id', sessionId)
        .order('timestamp', { ascending: false })
        .limit(1);

      if (impressions && impressions.length > 0) {
        linkedImpressionId = impressions[0].id;
      }
    }

    const { error } = await supabase
      .from('ad_clicks')
      .insert({
        impression_id: linkedImpressionId || null,
        campaign_id: campaignId,
        creative_id: creativeId,
        date: new Date().toISOString().split('T')[0],
      });

    if (error) {
      logger.error('logClick', 'Error logging click', { error: error.message });
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    logger.error('logClick', 'Error logging click', { error: err instanceof Error ? err.message : String(err) });
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }
}

/**
 * Check if ad should be shown based on frequency capping
 * This is a client-side check, server-side filtering also applies
 */
export async function shouldShowAd(
  campaignId: string,
  sessionId: string,
  userId?: string
): Promise<boolean> {
  try {
    // Check session-based frequency cap (max 3 per session within 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data: sessionImpressions, error: sessionError } = await supabase
      .from('ad_impressions')
      .select('id')
      .eq('campaign_id', campaignId)
      .eq('session_id', sessionId)
      .gte('timestamp', fiveMinutesAgo)
      .limit(3);

    if (sessionError) {
      logger.error('shouldShowAd', 'Error checking session frequency', { error: sessionError.message });
      return true; // Allow ad on error
    }

    if (sessionImpressions && sessionImpressions.length >= 3) {
      return false; // Too many impressions in this session
    }

    // Check user-based frequency cap (max 10 per day)
    if (userId) {
      const today = new Date().toISOString().split('T')[0];

      const { data: userImpressions, error: userError } = await supabase
        .from('ad_impressions')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('user_id', userId)
        .eq('date', today)
        .limit(10);

      if (userError) {
        logger.error('shouldShowAd', 'Error checking user frequency', { error: userError.message });
        return true; // Allow ad on error
      }

      if (userImpressions && userImpressions.length >= 10) {
        return false; // Too many impressions for this user today
      }
    }

    return true; // Ad can be shown
  } catch (err) {
    logger.error('shouldShowAd', 'Error checking frequency cap', { error: err instanceof Error ? err.message : String(err) });
    return true; // Allow ad on error
  }
}

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

  let visibilityTimer: NodeJS.Timeout | null = null;
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
