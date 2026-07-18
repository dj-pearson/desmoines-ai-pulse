import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from '@/lib/logger';

const log = createLogger('useActiveAds');

export interface ActiveAd {
  campaign_id: string;
  creative_id: string;
  title?: string;
  description?: string;
  image_url?: string;
  link_url?: string;
  cta_text?: string;
}

// Campaign creatives change slowly relative to a page view — cache ~5 min
// (WEB-FEAT-004) so browsing doesn't re-hit the RPC on every list render.
const AD_STALE_TIME = 5 * 60 * 1000;

/** Placements the `placement_type` DB enum actually accepts. Anything outside this
 *  set makes the RPC fail with `invalid input value for enum placement_type`. */
const SERVABLE_PLACEMENTS = ['top_banner', 'featured_spot', 'below_fold'] as const;

type ServablePlacement = typeof SERVABLE_PLACEMENTS[number];
export type AdPlacement = ServablePlacement | 'sidebar';

function isServable(placement: AdPlacement): placement is ServablePlacement {
  return (SERVABLE_PLACEMENTS as readonly string[]).includes(placement);
}

export function useActiveAds(placementType: AdPlacement) {
  // `sidebar` is a front-end-only placement — it exists in PLACEMENT_SPECS but was
  // never added to the `placement_type` DB enum, so no campaign can ever target it
  // and the RPC rejects it outright. Skip the call and let the caller fall back to a
  // house ad instead of erroring on every render (WEB-QA-003).
  const servable = isServable(placementType);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['active-ads', placementType],
    enabled: servable,
    queryFn: async (): Promise<ActiveAd | null> => {
      const { data, error } = await supabase.rpc('get_active_ads', {
        p_placement_type: placementType as ServablePlacement,
      });
      if (error) {
        // Log the PostgREST fields, not the bare object — a console-collapsed
        // `Object` hid this failure's actual code for weeks.
        log.error('fetchActiveAd', 'Error fetching active ad', {
          placementType,
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        throw error;
      }
      return (data?.[0] as ActiveAd | undefined) ?? null;
    },
    staleTime: AD_STALE_TIME,
  });

  return { ad: data ?? null, isLoading: servable ? isLoading : false, refetch };
}
