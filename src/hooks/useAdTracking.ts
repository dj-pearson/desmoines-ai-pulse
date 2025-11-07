import { useEffect, useRef, useState, useCallback } from 'react';
import {
  logImpression,
  logClick,
  getOrCreateSessionId,
  createViewabilityObserver,
  shouldShowAd,
} from '@/lib/tracking';
import { useAuth } from './useAuth';

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
        console.log('Ad frequency cap reached for campaign:', campaignId);
        return;
      }

      // Log the impression
      const result = await logImpression(campaignId, creativeId, placementType);

      if (result.success) {
        setImpressionLogged(true);
        setImpressionId(result.impressionId || null);
        console.log('Impression logged:', {
          campaignId,
          creativeId,
          impressionId: result.impressionId,
        });
      } else {
        console.error('Failed to log impression:', result.error);
      }
    } catch (error) {
      console.error('Error tracking impression:', error);
    }
  }, [campaignId, creativeId, placementType, impressionLogged, user?.id]);

  // Track click event
  const trackClick = useCallback(async () => {
    try {
      const result = await logClick(campaignId, creativeId, impressionId || undefined);

      if (result.success) {
        console.log('Click logged:', { campaignId, creativeId, impressionId });
      } else {
        console.error('Failed to log click:', result.error);
      }
    } catch (error) {
      console.error('Error tracking click:', error);
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
