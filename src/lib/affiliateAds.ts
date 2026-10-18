/**
 * Static registry for affiliate ad partners.
 * Maps brands to their creative assets and affiliate tracking URLs.
 */

export type AffiliateAdSize = '728x90' | '300x250' | '160x600';

export interface AffiliatePartner {
  id: string;
  name: string;
  affiliateUrl: string;
  assets: Record<AffiliateAdSize, string>;
  isActive: boolean;
}

// WEB-ADS-007: `sidebar` dropped here too. AffiliateAdBanner is reachable only
// through AdBanner, whose placement prop no longer admits it, so the branch was
// unreachable the moment the campaign placement went.
export type AffiliatePlacement = 'top_banner' | 'below_fold' | 'featured_spot';

/** Maps ad placements to the image size used for that slot */
export const AFFILIATE_PLACEMENT_SIZE_MAP: Record<AffiliatePlacement, AffiliateAdSize> = {
  top_banner: '728x90',
  below_fold: '728x90',
  featured_spot: '300x250',
};

/**
 * The impact.com tracking link for each hotel brand we hold an affiliate
 * agreement with (WEB-FEAT-021). These were kept in a root hotels/ directory
 * as affiliate.txt files beside copies of the banner creative; the creative
 * lives under public/ads/affiliates and the links live here.
 *
 * Hilton and Choice have a link and no banner creative, so they are not in
 * AFFILIATE_PARTNERS below (every partner there must have all three sizes).
 * They are brand-level links, not per-property deep links: what goes on
 * hotels.affiliate_url is still the owner's call in WEB-FEAT-021 AC2.
 */
export const HOTEL_BRAND_AFFILIATE_LINKS = {
  choice: 'https://choice.mtko.net/7XaD7O',
  hilton: 'https://hilton.ijrn.net/bkbJvP',
  hyatt: 'https://hyatt.jewn.net/DWyqGG',
  ihg: 'https://ihg.hmxg.net/5kaEq9',
  marriott: 'https://marriott.pxf.io/en1QGZ',
} as const;

export const AFFILIATE_PARTNERS: AffiliatePartner[] = [
  {
    id: 'hyatt',
    name: 'Hyatt',
    affiliateUrl: HOTEL_BRAND_AFFILIATE_LINKS.hyatt,
    assets: {
      '728x90': '/ads/affiliates/hyatt/728x90.jpeg',
      '300x250': '/ads/affiliates/hyatt/300x250.jpeg',
      '160x600': '/ads/affiliates/hyatt/160x600.jpeg',
    },
    isActive: true,
  },
  {
    id: 'ihg',
    name: 'IHG',
    affiliateUrl: HOTEL_BRAND_AFFILIATE_LINKS.ihg,
    assets: {
      '728x90': '/ads/affiliates/ihg/728x90.jpeg',
      '300x250': '/ads/affiliates/ihg/300x250.jpeg',
      '160x600': '/ads/affiliates/ihg/160x600.jpeg',
    },
    isActive: true,
  },
  {
    id: 'marriott',
    name: 'Marriott',
    affiliateUrl: HOTEL_BRAND_AFFILIATE_LINKS.marriott,
    assets: {
      '728x90': '/ads/affiliates/marriott/728x90.jpeg',
      '300x250': '/ads/affiliates/marriott/300x250.jpeg',
      '160x600': '/ads/affiliates/marriott/160x600.jpeg',
    },
    isActive: true,
  },
];

/**
 * Returns only partners flagged as active. `isActive` above is the only
 * switch: the admin page shows it read-only (plan WP6).
 */
export function getActiveAffiliatePartners(): AffiliatePartner[] {
  return AFFILIATE_PARTNERS.filter((p) => p.isActive);
}
