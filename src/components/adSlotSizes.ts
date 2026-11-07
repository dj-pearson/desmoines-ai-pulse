/**
 * Ad slot geometry, shared by AdBanner and LazyAdBanner.
 *
 * Kept out of AdBanner.tsx so the lazy wrapper can size its Suspense fallback
 * without a static import of AdBanner, which would pull HouseAd and
 * UpgradeModal back into every hub page chunk.
 */
export type AdSlotPlacement = 'top_banner' | 'featured_spot' | 'below_fold';

/** Height of a rendered campaign ad in each placement. */
export const PLACEMENT_SIZE_CLASSES: Record<AdSlotPlacement, string> = {
  top_banner: "h-20 md:h-28",
  featured_spot: "min-h-[220px] md:min-h-[250px]",
  below_fold: "h-20 md:h-28",
};

/**
 * Height each placement reserves while its chunk, auth state and ad query
 * resolve, so the slot doesn't grow from 0 to 80-112px under the reader once
 * an ad arrives.
 */
export const PLACEMENT_RESERVE_CLASSES: Record<AdSlotPlacement, string> = {
  top_banner: "min-h-20 md:min-h-28",
  featured_spot: "min-h-[220px] md:min-h-[250px]",
  below_fold: "min-h-20 md:min-h-28",
};

/**
 * Intrinsic size of a campaign creative per placement (IAB leaderboard and
 * medium rectangle). Campaign rows carry no dimensions, so these are the
 * width/height attributes the <img> gets; the rendered box comes from the
 * slot's classes and object-cover.
 */
export const PLACEMENT_CREATIVE_SIZE: Record<AdSlotPlacement, { width: number; height: number }> = {
  top_banner: { width: 728, height: 90 },
  featured_spot: { width: 300, height: 250 },
  below_fold: { width: 728, height: 90 },
};

/**
 * Where each placement sits, for the landmark's accessible name. A page can
 * render two ad slots, and two complementary landmarks with one name can't be
 * told apart in a screen reader's landmark list (WEB-UX-046).
 */
export const PLACEMENT_LABELS: Record<AdSlotPlacement, string> = {
  top_banner: "top of page",
  featured_spot: "featured",
  below_fold: "below listings",
};
