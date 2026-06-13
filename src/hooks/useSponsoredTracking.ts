import { useCallback, useEffect, useRef } from 'react';
import {
  createViewabilityObserver,
  trackSponsoredListingClick,
  trackSponsoredListingImpression,
  type SponsoredListingType,
} from '@/lib/tracking';

/**
 * Track impressions + clicks for a sponsored listing card (WEB-FEAT-005).
 *
 * The impression fires once the card is ≥50% visible for ≥1s (viewability, same
 * threshold as iOS/ad slots) and only when `active` — i.e. the card is showing
 * the Sponsored treatment. `trackClick` is a no-op unless active, so callers can
 * wire it unconditionally.
 *
 * Returns a ref to attach to the card root element.
 */
export function useSponsoredTracking<T extends HTMLElement = HTMLElement>(
  active: boolean,
  itemType: SponsoredListingType,
  itemId: string,
) {
  const ref = useRef<T | null>(null);
  const firedImpression = useRef(false);

  useEffect(() => {
    if (!active || !ref.current || firedImpression.current) return;
    const observer = createViewabilityObserver(ref.current, () => {
      if (firedImpression.current) return;
      firedImpression.current = true;
      trackSponsoredListingImpression(itemType, itemId);
    });
    return () => observer.disconnect();
  }, [active, itemType, itemId]);

  const trackClick = useCallback(() => {
    if (!active) return;
    trackSponsoredListingClick(itemType, itemId);
  }, [active, itemType, itemId]);

  return { ref, trackClick };
}
