/**
 * Single source of truth for advertising placement specifications.
 * Used by both the Advertise page (informational) and CreativeUploader (validation).
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
  description: string;
  dimensions: PlacementDimension[];
  maxSize: number; // bytes
  maxSizeLabel: string;
  aspectRatio: string;
  formats: string[];
  animationType: string;
  features: string[];
  specifications: string[];
  /** When true, no image creative upload is required — uses the listing's own image */
  noCreativeRequired?: boolean;
}

export const PLACEMENT_SPECS: Record<PlacementType, PlacementSpec> = {
  top_banner: {
    type: 'top_banner',
    name: 'Top Banner',
    description: 'Premium placement at the top of every page',
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
    features: ['Maximum visibility', 'Mobile & desktop', 'All pages'],
    specifications: [
      'High-resolution images (300 DPI recommended)',
      'Clear, readable text even at small sizes',
      'Strong call-to-action button',
      'Brand logo prominently displayed',
    ],
  },
  featured_spot: {
    type: 'featured_spot',
    name: 'Featured Spot',
    description: 'Highlighted placement in search results and event listings',
    dimensions: [
      { width: 300, height: 250, label: '300x250 (Medium Rectangle)' },
      { width: 336, height: 280, label: '336x280 (Large Rectangle)' },
    ],
    maxSize: 307200, // 300KB
    maxSizeLabel: '300KB',
    aspectRatio: '1:1 or 6:5',
    formats: ['JPG', 'PNG', 'WebP', 'GIF'],
    animationType: 'Static or subtle animation (GIF up to 5 seconds)',
    features: ['1st or 2nd position', 'Event listings', 'High engagement'],
    specifications: [
      'Eye-catching visuals with local appeal',
      'Clear business name and offering',
      'High contrast for mobile readability',
      'Include location or Des Moines reference',
    ],
  },
  below_fold: {
    type: 'below_fold',
    name: 'Below the Fold',
    description: 'Cost-effective placement integrated within content areas',
    dimensions: [
      { width: 728, height: 90, label: '728x90 (Leaderboard)' },
      { width: 320, height: 50, label: '320x50 (Mobile Banner)' },
    ],
    maxSize: 409600, // 400KB
    maxSizeLabel: '400KB',
    aspectRatio: '8:1',
    formats: ['JPG', 'PNG', 'WebP'],
    animationType: 'Static images preferred',
    features: ['Content integration', 'Targeted audience', 'Great value'],
    specifications: [
      'Native advertising style preferred',
      'Blend with editorial content design',
      'Focus on value proposition',
      'Local Des Moines imagery encouraged',
    ],
  },
sponsored_listing: {
    type: 'sponsored_listing',
    name: 'Sponsored Listing',
    description: 'Promote your event or restaurant as a sponsored featured item — appears first in the featured section with a "Sponsored" badge. Uses your existing listing details, no image upload needed.',
    dimensions: [],
    maxSize: 0,
    maxSizeLabel: 'N/A',
    aspectRatio: 'N/A',
    formats: [],
    animationType: 'N/A',
    noCreativeRequired: true,
    features: [
      'Priority placement in Featured section',
      '"Sponsored" badge (FTC-compliant)',
      'Boosted in AI recommendations',
      'Auto-expires when campaign ends',
      'Uses your existing listing image & details',
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
