/**
 * Single source of truth for advertising placement specifications.
 * Used by the Advertise page (where each slot runs) and CreativeUploader (validation).
 */

/*
 * WEB-ADS-007. `sidebar` WAS IN THIS UNION AND IN NOTHING ELSE THAT MATTERED.
 *
 * /advertise renders every entry of PLACEMENT_SPECS as purchasable, so Sidebar
 * Skyscraper was on sale. It was absent from all three systems needed to
 * actually sell it: the `placement_type` DB enum (top_banner, featured_spot,
 * below_fold, sponsored_listing), the ad_rate_card, and the label map in
 * create-campaign-checkout. Buying it created the campaigns row and then failed
 * the campaign_placements insert, leaving an orphan draft campaign and an
 * advertiser with nothing.
 *
 * Dropped rather than added, per the story's own recommendation and on the
 * evidence: adding it needs a price nobody has set, inventory nobody has
 * committed, and a mobile placement that does not exist (XPLAT-005). Its two
 * render slots only ever served house ads, because useActiveAds short-circuited
 * on it, and both pages already carry other slots.
 *
 * Every value here must exist in the DB enum. scripts/check-placement-enum.mjs
 * enforces that now, which is the check that was missing.
 */
export type PlacementType = 'top_banner' | 'featured_spot' | 'below_fold' | 'sponsored_listing';

export interface PlacementDimension {
  width: number;
  height: number;
  label: string;
}

/**
 * The pages a placement is mounted on, by the label a buyer knows them by.
 * placementSpecs.test.ts reads every `<AdBanner placement="...">` in src/ and
 * fails when this list and the mounts disagree, so the page can't promise a
 * slot that isn't there ("every page" was the old top-banner copy; it ran on
 * two).
 */
export type PlacementPage = 'Home' | 'Events' | 'Restaurants' | 'Attractions';

/**
 * WEB-ADS-003: `dailyCost` was removed from this file. A price that lives in
 * the bundle disagrees with the rate card the moment an admin edits a rate, and
 * it did: the /advertise summary totalled these static numbers while the stored
 * campaign came from calculate_campaign_pricing() with its volume discount, so
 * the page said $70 and the row said $66.50. Prices come from ad_rate_card via
 * fetchRateCard(), and the amount charged is computed server-side.
 */
export interface PlacementSpec {
  type: PlacementType;
  name: string;
  /** Where it shows, built from `pages`. */
  description: string;
  /** Pages it is mounted on (web). Pinned by placementSpecs.test.ts. */
  pages: PlacementPage[];
  dimensions: PlacementDimension[];
  maxSize: number; // bytes
  maxSizeLabel: string;
  aspectRatio: string;
  formats: string[];
  animationType: string;
  features: string[];
  specifications: string[];
  /** When true, no image creative upload is required - uses the listing's own image */
  noCreativeRequired?: boolean;
}

/** "Home", "Home and Events", "Home, Events and Restaurants". */
export function joinPages(pages: readonly string[]): string {
  if (pages.length <= 1) return pages[0] ?? '';
  return `${pages.slice(0, -1).join(', ')} and ${pages[pages.length - 1]}`;
}

/** Pixel size is what the upload checks; DPI means nothing on a screen. */
const PIXEL_SIZE_NOTE = 'Exactly one of the sizes above, in pixels (DPI is ignored on screen)';

const TOP_BANNER_PAGES: PlacementPage[] = ['Home', 'Events'];
const FEATURED_SPOT_PAGES: PlacementPage[] = ['Restaurants', 'Attractions'];
const BELOW_FOLD_PAGES: PlacementPage[] = ['Home', 'Events', 'Restaurants', 'Attractions'];
/** Not an AdBanner slot: arrangeSponsored() lifts the listing in these lists. */
const SPONSORED_LISTING_PAGES: PlacementPage[] = ['Events', 'Restaurants'];

export const PLACEMENT_SPECS: Record<PlacementType, PlacementSpec> = {
  top_banner: {
    type: 'top_banner',
    name: 'Top Banner',
    description: `Banner near the top of the ${joinPages(TOP_BANNER_PAGES)} pages`,
    pages: TOP_BANNER_PAGES,
    dimensions: [
      { width: 970, height: 90, label: '970x90 (Desktop Leaderboard)' },
      { width: 728, height: 90, label: '728x90 (Standard Leaderboard)' },
      { width: 320, height: 50, label: '320x50 (Mobile Banner)' },
    ],
    maxSize: 512000, // 500KB
    maxSizeLabel: '500KB',
    aspectRatio: '~10.8:1',
    formats: ['JPG', 'PNG', 'WebP'],
    animationType: 'Static images only',
    features: ['Mobile and desktop', 'Static image'],
    specifications: [
      PIXEL_SIZE_NOTE,
      'Clear, readable text even at small sizes',
      'Strong call-to-action button',
      'Brand logo prominently displayed',
    ],
  },
  featured_spot: {
    type: 'featured_spot',
    name: 'Featured Spot',
    description: `Rectangle inside the ${joinPages(FEATURED_SPOT_PAGES)} lists`,
    pages: FEATURED_SPOT_PAGES,
    dimensions: [
      { width: 300, height: 250, label: '300x250 (Medium Rectangle)' },
      { width: 336, height: 280, label: '336x280 (Large Rectangle)' },
    ],
    maxSize: 307200, // 300KB
    maxSizeLabel: '300KB',
    aspectRatio: '1:1 or 6:5',
    formats: ['JPG', 'PNG', 'WebP', 'GIF'],
    animationType: 'Static or subtle animation (GIF up to 5 seconds)',
    features: ['Mobile and desktop', 'Static or short GIF'],
    specifications: [
      PIXEL_SIZE_NOTE,
      'Clear business name and offering',
      'High contrast for mobile readability',
      'Include location or Des Moines reference',
    ],
  },
  below_fold: {
    type: 'below_fold',
    name: 'Below the Fold',
    description: `Banner further down the ${joinPages(BELOW_FOLD_PAGES)} pages`,
    pages: BELOW_FOLD_PAGES,
    dimensions: [
      { width: 728, height: 90, label: '728x90 (Leaderboard)' },
      { width: 320, height: 50, label: '320x50 (Mobile Banner)' },
    ],
    maxSize: 409600, // 400KB
    maxSizeLabel: '400KB',
    aspectRatio: '8:1',
    formats: ['JPG', 'PNG', 'WebP'],
    animationType: 'Static images preferred',
    features: ['Mobile and desktop', 'Static image'],
    specifications: [
      PIXEL_SIZE_NOTE,
      'Native advertising style preferred',
      'Focus on value proposition',
      'Local Des Moines imagery encouraged',
    ],
  },
  sponsored_listing: {
    type: 'sponsored_listing',
    name: 'Sponsored Listing',
    description: `Your event or restaurant moved to the top of the ${joinPages(SPONSORED_LISTING_PAGES)} list, labelled Sponsored. Uses your listing's own photo and details, so there's nothing to upload.`,
    pages: SPONSORED_LISTING_PAGES,
    dimensions: [],
    maxSize: 0,
    maxSizeLabel: 'N/A',
    aspectRatio: 'N/A',
    formats: [],
    animationType: 'N/A',
    noCreativeRequired: true,
    features: [
      'Top of the list, two sponsored listings at most',
      '"Sponsored" label (FTC)',
      'Ends when the campaign ends',
      'No upload needed',
    ],
    specifications: [
      'Select the specific event or restaurant to promote',
      'Listing must already exist on Des Moines Insider',
      'Sponsored label shown per FTC 16 CFR Part 255 guidelines',
      'Campaign end date removes sponsorship automatically',
    ],
  },
};

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
