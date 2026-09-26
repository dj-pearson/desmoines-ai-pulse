import { useEffect, useMemo } from 'react';
import { storage } from '@/lib/safeStorage';
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
 * The memo only READS the session. It used to write storage inside useMemo,
 * a side effect in render: StrictMode and concurrent rendering may run a memo
 * more than once or throw its result away, so the brand could advance twice
 * or be recorded for a render that never committed. The write is an effect
 * now, and only for a new session.
 */
export function useAffiliateAd(placement: AffiliatePlacement) {
  const ad = useMemo(() => {
    const partners = getActiveAffiliatePartners();
    if (partners.length === 0) {
      return { partner: null, imageUrl: null, affiliateUrl: null, width: 0, height: 0, newSession: null };
    }

    const now = Date.now();
    const session = storage.get<BrandSession>(STORAGE_KEY);

    let index: number;
    let newSession: BrandSession | null = null;
    if (session && now - session.timestamp < SESSION_DURATION_MS) {
      // Same session: keep the brand.
      index = session.index % partners.length;
    } else {
      // New session: advance to the next brand; recorded by the effect below.
      index = session ? (session.index + 1) % partners.length : 0;
      newSession = { index, timestamp: now };
    }

    const partner: AffiliatePartner = partners[index];
    const size = AFFILIATE_PLACEMENT_SIZE_MAP[placement];
    const imageUrl = partner.assets[size];

    // WEB-PERF-041: the banner rendered `w-full h-auto` with no width or
    // height, so it reserved nothing and pushed the page down when it loaded -
    // above the fold, on the top_banner placement. The exact dimensions were
    // already sitting in the size key ("728x90"); nothing had read them.
    const [width, height] = size.split("x").map(Number);

    return { partner, imageUrl, affiliateUrl: partner.affiliateUrl, width, height, newSession };
  }, [placement]);

  const { newSession, ...result } = ad;

  useEffect(() => {
    if (newSession) storage.set<BrandSession>(STORAGE_KEY, newSession);
  }, [newSession]);

  return result;
}
