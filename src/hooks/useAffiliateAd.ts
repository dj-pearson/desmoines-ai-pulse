import { useMemo } from 'react';
import { storage } from '@/lib/safeStorage';
import { useAffiliateAdLinks } from '@/hooks/useAffiliateAdLinks';
import {
  getActiveAffiliatePartners,
  AFFILIATE_PLACEMENT_SIZE_MAP,
  type AffiliatePlacement,
  type AffiliatePartner,
} from '@/lib/affiliateAds';

const STORAGE_KEY = 'affiliate_brand_session';
const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes

interface BrandSession {
  index: number;
  timestamp: number;
}

/**
 * Returns an affiliate ad for the given placement.
 * Uses round-robin brand selection with a 30-minute session window
 * so all ad slots on a page show the same brand.
 *
 * The click-through is the brand's deep link from `hotel_affiliate_programs`
 * (HOTEL-AFF-002) when that brand's program is configured, so the banner lands
 * on a bookable Des Moines search page. It falls back to the static link in
 * affiliateAds.ts — the program's default creative, which goes to the loyalty
 * enrolment page — for brands not yet set up.
 */
export function useAffiliateAd(placement: AffiliatePlacement) {
  const deepLinks = useAffiliateAdLinks();

  return useMemo(() => {
    const partners = getActiveAffiliatePartners();
    if (partners.length === 0) {
      return { partner: null, imageUrl: null, affiliateUrl: null };
    }

    const now = Date.now();
    const session = storage.get<BrandSession>(STORAGE_KEY);

    let index: number;
    if (session && now - session.timestamp < SESSION_DURATION_MS) {
      // Same session — keep brand
      index = session.index % partners.length;
    } else {
      // New session — advance to next brand
      index = session ? (session.index + 1) % partners.length : 0;
      storage.set<BrandSession>(STORAGE_KEY, { index, timestamp: now });
    }

    const partner: AffiliatePartner = partners[index];
    const size = AFFILIATE_PLACEMENT_SIZE_MAP[placement];
    const imageUrl = partner.assets[size];
    const affiliateUrl = deepLinks[partner.brandParent] ?? partner.affiliateUrl;

    return { partner, imageUrl, affiliateUrl };
  }, [placement, deepLinks]);
}
