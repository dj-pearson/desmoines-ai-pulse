import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
 * Campaign creatives change rarely relative to a browsing session, so the
 * get_active_ads RPC is cached ~5min (a slot shows the same paid creative for
 * the visit instead of re-hitting the RPC on every mount / navigation).
 */
const AD_STALE_TIME = 5 * 60 * 1000;

export function useActiveAds(
  placementType: 'top_banner' | 'featured_spot' | 'below_fold' | 'sidebar',
) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['active-ad', placementType],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_active_ads', {
        p_placement_type: placementType,
      });
      if (error) throw error;
      return ((data?.[0] as ActiveAd | undefined) ?? null);
    },
    staleTime: AD_STALE_TIME,
    gcTime: AD_STALE_TIME,
  });

  return { ad: data ?? null, isLoading, refetch };
}
