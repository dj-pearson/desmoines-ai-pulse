import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';

const logger = createLogger('useAffiliateAdLinks');

/** brand_parent -> deep-linked banner URL */
export type AffiliateAdLinkMap = Record<string, string>;

/**
 * Module-level cache. The banner renders in up to four slots per page and the
 * link set is the same for every visitor, so one request per page load is
 * plenty. Held as a promise so concurrent mounts share the in-flight request
 * rather than each firing their own.
 */
let cache: Promise<AffiliateAdLinkMap> | null = null;

async function loadLinks(): Promise<AffiliateAdLinkMap> {
  const { data, error } = await supabase.rpc('get_affiliate_ad_links');

  if (error) {
    // Non-fatal: callers fall back to the static link in affiliateAds.ts.
    logger.warn('loadLinks', 'Falling back to static affiliate links', {
      error: error.message,
    });
    return {};
  }

  const map: AffiliateAdLinkMap = {};
  for (const row of data ?? []) {
    if (row.brand_parent && row.ad_url) {
      map[row.brand_parent] = row.ad_url;
    }
  }
  return map;
}

/**
 * Resolves the deep-linked banner URL for each brand whose affiliate program is
 * configured in `hotel_affiliate_programs`.
 *
 * Returns `{}` until the request resolves, and on any failure, so a caller can
 * always fall back to the brand's static link without a loading state or a
 * blank ad slot.
 */
export function useAffiliateAdLinks(): AffiliateAdLinkMap {
  const [links, setLinks] = useState<AffiliateAdLinkMap>({});

  useEffect(() => {
    let active = true;
    cache ??= loadLinks();
    void cache.then((result) => {
      if (active) setLinks(result);
    });
    return () => {
      active = false;
    };
  }, []);

  return links;
}

/** Test/admin helper — forces the next call to re-fetch. */
export function resetAffiliateAdLinkCache(): void {
  cache = null;
}
