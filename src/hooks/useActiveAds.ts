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

/**
 * Whether a creative has enough to draw. Mirrors Android's
 * `CampaignAd.isRenderable` (data/model/CampaignAd.kt) so the three surfaces
 * agree on what counts as an ad (XPLAT-005 AC2).
 *
 * Exported for the test, and because "what is renderable" is a rule worth
 * having one definition of rather than three.
 */
export function isRenderable(ad: ActiveAd | null | undefined): ad is ActiveAd {
  if (!ad?.campaign_id || !ad?.creative_id) return false;
  const hasTitle = (ad.title ?? '').trim().length > 0;
  const hasImage = (ad.image_url ?? '').trim().length > 0;
  return hasTitle || hasImage;
}

// Campaign creatives change slowly relative to a page view — cache ~5 min
// (WEB-FEAT-004) so browsing doesn't re-hit the RPC on every list render.
const AD_STALE_TIME = 5 * 60 * 1000;

/** Placements the `placement_type` DB enum actually accepts. Anything outside this
 *  set makes the RPC fail with `invalid input value for enum placement_type`.
 *
 *  XPLAT-005: sponsored_listing was missing here while iOS (CampaignAdService
 *  .swift:20-25) and Android (CampaignAdService.kt:66-69) both carried it, so
 *  that placement rendered on mobile only. The omission was justified by the
 *  comment above, and that justification was simply out of date — the live enum
 *  has carried all four values for some time. Verified against production:
 *    SELECT enumlabel FROM pg_enum ... WHERE typname='placement_type'
 *      -> top_banner, featured_spot, below_fold, sponsored_listing
 *  and get_active_ads('sponsored_listing') returns HTTP 200.
 *
 *  `sidebar` is still deliberately absent: it is a front-end-only name that was
 *  never added to the enum, which is why isServable short-circuits it below
 *  rather than letting it reach the RPC (AC3 is the decision on whether it
 *  should exist at all). */
const SERVABLE_PLACEMENTS = [
  'top_banner',
  'featured_spot',
  'below_fold',
  'sponsored_listing',
] as const;

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
      // Send all three parameters, even though the last two are DEFAULT NULL.
      //
      // Production still carries two get_active_ads overloads — the superseded
      // `(p_placement_type TEXT)` one and the canonical
      // `(p_placement_type placement_type, p_session_id TEXT, p_user_id UUID)`.
      // A one-argument call matches both, so PostgREST answers 300/PGRST203
      // ("Could not choose the best candidate function") on every homepage load.
      // Naming p_session_id and p_user_id excludes the single-parameter overload
      // and the call resolves. supabase/migrations/20260718000001_resolve_get_
      // active_ads_overload.sql drops the stray overload; this keeps the call
      // site unambiguous whether or not that migration has been applied yet,
      // and on any older client build that has not been redeployed.
      // NULL, not undefined, and the cast is why. The regenerated schema types
      // these optional SQL parameters as `string | undefined`, but supabase-js
      // JSON-stringifies the args and an undefined key is DROPPED - which
      // sends the one-argument body again and reinstates the PGRST203
      // ambiguity described above. Both parameters accept NULL in SQL.
      const args = {
        p_placement_type: placementType as ServablePlacement,
        p_session_id: null,
        p_user_id: null,
      } as unknown as Parameters<typeof supabase.rpc<'get_active_ads'>>[1];
      const { data, error } = await supabase.rpc('get_active_ads', args);
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
      // Take the first RENDERABLE row, not the first row (XPLAT-005 AC2).
      //
      // Android has filtered on `isRenderable` since it shipped; web took
      // data[0] unconditionally and iOS required only non-nil ids, so a
      // creative with no title and no image rendered as an empty ad slot on
      // two surfaces and was correctly skipped on the third. An empty slot is
      // worse than no slot: it takes layout space, it is reported as an
      // impression, and the advertiser is billed for it.
      //
      // Same rule as CampaignAd.isRenderable in Android: something to read or
      // something to look at. Deliberately not "and" - a text-only creative is
      // a legitimate ad.
      const rows = (data ?? []) as ActiveAd[];
      return rows.find(isRenderable) ?? null;
    },
    staleTime: AD_STALE_TIME,
  });

  return { ad: data ?? null, isLoading: servable ? isLoading : false, refetch };
}
