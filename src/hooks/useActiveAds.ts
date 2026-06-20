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

export function useActiveAds(
  placementType: 'top_banner' | 'featured_spot' | 'below_fold' | 'sidebar'
) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['active-ads', placementType],
    queryFn: async (): Promise<ActiveAd | null> => {
      const { data, error } = await supabase.rpc('get_active_ads', {
        p_placement_type: placementType,
      });
      if (error) {
        log.error('fetchActiveAd', 'Error fetching active ad', { error });
        throw error;
      }
      return (data?.[0] as ActiveAd | undefined) ?? null;
    },
    staleTime: AD_STALE_TIME,
  });

  return { ad: data ?? null, isLoading, refetch };
}
