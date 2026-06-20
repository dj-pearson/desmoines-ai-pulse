import { useEffect, type RefObject } from "react";
import { createViewabilityObserver } from "@/lib/tracking";
import { logSponsoredImpression } from "@/lib/sponsored";

/**
 * Logs a sponsored-listing impression when the element is >=50% visible for
 * >=1s (the same viewability contract as paid ads), deduped per session.
 * No-op unless `active` is true. (WEB-FEAT-005)
 */
export function useSponsoredImpression(
  ref: RefObject<HTMLElement>,
  contentType: string,
  contentId: string,
  active: boolean
): void {
  useEffect(() => {
    if (!active || !ref.current) return;
    const observer = createViewabilityObserver(ref.current, () => {
      logSponsoredImpression(contentType, contentId);
    });
    return () => observer.disconnect();
  }, [ref, contentType, contentId, active]);
}
