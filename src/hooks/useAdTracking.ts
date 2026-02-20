import { useEffect, useRef, useState, useCallback } from 'react';
import {
  logImpression,
  logClick,
  getOrCreateSessionId,
  createViewabilityObserver,
  shouldShowAd,
} from '@/lib/tracking';
import { useAuth } from './useAuth';
import { createLogger } from '@/lib/logger';

const log = createLogger('useAdTracking');

interface AdTrackingOptions {
  campaignId: string;
  creativeId: string;
  placementType: string;
  autoTrackImpression?: boolean;
  viewabilityThreshold?: number; // 0-1, default 0.5 (50%)
  viewabilityDuration?: number; // milliseconds, default 1000
}

interface AdTrackingReturn {
  impressionLogged: boolean;
  impressionId: string | null;
  trackClick: () => Promise<void>;
  adRef: React.RefObject<HTMLDivElement>;
}

/**
 * Custom hook for tracking ad impressions and clicks
 * Automatically handles viewability tracking using IntersectionObserver
 */
export function useAdTracking(options: AdTrackingOptions): AdTrackingReturn {
  const {
    campaignId,
    creativeId,
    placementType,
    autoTrackImpression = true,
    viewabilityThreshold = 0.5,
    viewabilityDuration = 1000,
  } = options;

  const { user } = useAuth();
  const adRef = useRef<HTMLDivElement>(null);
  const [impressionLogged, setImpressionLogged] = useState(false);
  const [impressionId, setImpressionId] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Track impression when ad becomes viewable
  const trackImpression = useCallback(async () => {
    if (impressionLogged) return;

    try {
      // Check frequency cap before logging
      const sessionId = getOrCreateSessionId();
      const canShow = await shouldShowAd(campaignId, sessionId, user?.id);

      if (!canShow) {
        log.debug('trackImpression', 'Ad frequency cap reached for campaign', { campaignId });
        return;
      }

      // Log the impression
      const result = await logImpression(campaignId, creativeId, placementType);

      if (result.success) {
        setImpressionLogged(true);
        setImpressionId(result.impressionId || null);
        log.debug('trackImpression', 'Impression logged', { campaignId, creativeId, impressionId: result.impressionId });
      } else {
        log.error('trackImpression', 'Failed to log impression', { error: result.error });
      }
    } catch (error) {
      log.error('trackImpression', 'Error tracking impression', { error });
    }
  }, [campaignId, creativeId, placementType, impressionLogged, user?.id]);

  // Track click event
  const trackClick = useCallback(async () => {
    try {
      const result = await logClick(campaignId, creativeId, impressionId || undefined);

      if (result.success) {
        log.debug('trackClick', 'Click logged', { campaignId, creativeId, impressionId });
      } else {
        log.error('trackClick', 'Failed to log click', { error: result.error });
      }
    } catch (error) {
      log.error('trackClick', 'Error tracking click', { error });
    }
  }, [campaignId, creativeId, impressionId]);

  // Set up viewability observer
  useEffect(() => {
    if (!autoTrackImpression || !adRef.current || impressionLogged) {
      return;
    }

    // Create observer for viewability tracking
    observerRef.current = createViewabilityObserver(
      adRef.current,
      () => {
        trackImpression();
      },
      {
        threshold: viewabilityThreshold,
        minDuration: viewabilityDuration,
      }
    );

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [
    autoTrackImpression,
    impressionLogged,
    trackImpression,
    viewabilityThreshold,
    viewabilityDuration,
  ]);

  return {
    impressionLogged,
    impressionId,
    trackClick,
    adRef,
  };
}

/**
 * Hook for tracking multiple ads on the same page
 * Useful for pages with multiple ad placements
 */
export function useMultipleAdTracking(
  ads: Array<{
    campaignId: string;
    creativeId: string;
    placementType: string;
  }>
) {
  const [trackedAds, setTrackedAds] = useState<Set<string>>(new Set());

  const trackImpression = useCallback(
    async (ad: { campaignId: string; creativeId: string; placementType: string }) => {
      const adKey = `${ad.campaignId}-${ad.creativeId}`;

      if (trackedAds.has(adKey)) return;

      const result = await logImpression(ad.campaignId, ad.creativeId, ad.placementType);

      if (result.success) {
        setTrackedAds((prev) => new Set(prev).add(adKey));
      }
    },
    [trackedAds]
  );

  const trackClick = useCallback(
    async (ad: { campaignId: string; creativeId: string }) => {
      await logClick(ad.campaignId, ad.creativeId);
    },
    []
  );

  return {
    trackImpression,
    trackClick,
    trackedAds,
  };
}
