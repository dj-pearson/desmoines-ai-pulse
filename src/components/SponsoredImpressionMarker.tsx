import { useRef } from "react";
import { useSponsoredImpression } from "@/hooks/useSponsoredImpression";

/**
 * Headless marker that logs a sponsored-listing impression when its host area
 * is viewable. Drop it inside an inline (non-component) sponsored card where a
 * dedicated ref isn't otherwise available. (WEB-FEAT-005)
 */
export function SponsoredImpressionMarker({
  contentType,
  contentId,
  active,
}: {
  contentType: string;
  contentId: string;
  active: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useSponsoredImpression(ref, contentType, contentId, active);
  if (!active) return null;
  return <span ref={ref} aria-hidden className="absolute inset-0 pointer-events-none" />;
}
