/**
 * Static registry for affiliate ad partners.
 * Maps brands to their creative assets and affiliate tracking URLs.
 */

export type AffiliateAdSize = '728x90' | '300x250' | '160x600';

export interface AffiliatePartner {
  id: string;
  name: string;
  /**
   * Fallback link, used only until the brand's program is configured.
   *
   * These are the programs' DEFAULT CREATIVE links, which land on the loyalty
   * enrolment page rather than anything bookable. The real link is the deep
   * link built from `hotel_affiliate_programs.ad_destination_url` and served by
   * the `get_affiliate_ad_links` RPC — see `useAffiliateAdLinks`. Once a brand
   * is enabled in Admin → Hotels → Affiliate Programs, that link wins and this
   * one is never used.
   */
  affiliateUrl: string;
  /**
   * Links this creative to a row in `hotel_affiliate_programs`, so the banner
   * reuses the same credentials as the per-hotel booking links.
   */
  brandParent: string;
  assets: Record<AffiliateAdSize, string>;
  isActive: boolean;
}

export type AffiliatePlacement = 'top_banner' | 'below_fold' | 'featured_spot' | 'sidebar';

/** Maps ad placements to the image size used for that slot */
export const AFFILIATE_PLACEMENT_SIZE_MAP: Record<AffiliatePlacement, AffiliateAdSize> = {
  top_banner: '728x90',
  below_fold: '728x90',
  featured_spot: '300x250',
  sidebar: '160x600',
};

export const AFFILIATE_PARTNERS: AffiliatePartner[] = [
  {
    id: 'hyatt',
    brandParent: 'Hyatt',
    name: 'Hyatt',
    affiliateUrl: 'https://hyatt.jewn.net/DWyqGG',
    assets: {
      '728x90': '/ads/affiliates/hyatt/728x90.jpeg',
      '300x250': '/ads/affiliates/hyatt/300x250.jpeg',
      '160x600': '/ads/affiliates/hyatt/160x600.jpeg',
    },
    isActive: true,
  },
  {
    id: 'ihg',
    brandParent: 'IHG',
    name: 'IHG',
    affiliateUrl: 'https://ihg.hmxg.net/5kaEq9',
    assets: {
      '728x90': '/ads/affiliates/ihg/728x90.jpeg',
      '300x250': '/ads/affiliates/ihg/300x250.jpeg',
      '160x600': '/ads/affiliates/ihg/160x600.jpeg',
    },
    isActive: true,
  },
  {
    id: 'marriott',
    brandParent: 'Marriott',
    name: 'Marriott',
    affiliateUrl: 'https://marriott.pxf.io/en1QGZ',
    assets: {
      '728x90': '/ads/affiliates/marriott/728x90.jpeg',
      '300x250': '/ads/affiliates/marriott/300x250.jpeg',
      '160x600': '/ads/affiliates/marriott/160x600.jpeg',
    },
    isActive: true,
  },
];

/** Returns only partners flagged as active */
export function getActiveAffiliatePartners(): AffiliatePartner[] {
  return AFFILIATE_PARTNERS.filter((p) => p.isActive);
}
