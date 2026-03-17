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
