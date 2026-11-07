import { lazy, Suspense } from "react";
import { PLACEMENT_RESERVE_CLASSES, type AdSlotPlacement } from "@/components/adSlotSizes";

// AdBanner statically imports HouseAd, which imports UpgradeModal. As a static
// import on /events, /restaurants and /attractions that put all three in each
// hub's chunk. This lazy-loads it for the hubs and Home, with a fallback the
// size of the slot so nothing shifts when it lands.
const AdBannerImpl = lazy(() =>
  import("@/components/AdBanner").then((m) => ({ default: m.AdBanner }))
);

interface LazyAdBannerProps {
  placement: AdSlotPlacement;
  className?: string;
  /** Optional fallback content when no ads are available */
  fallback?: React.ReactNode;
}

export function AdBanner({ placement, className = "", fallback }: LazyAdBannerProps) {
  return (
    <Suspense
      fallback={
        <div
          aria-hidden="true"
          data-testid="ad-slot-placeholder"
          className={`${PLACEMENT_RESERVE_CLASSES[placement]} ${className}`}
        />
      }
    >
      <AdBannerImpl placement={placement} className={className} fallback={fallback} />
    </Suspense>
  );
}
