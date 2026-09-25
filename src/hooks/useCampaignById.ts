import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { STALE_TIME } from "@/lib/queryConfig";

export interface CampaignByIdPlacement {
  id: string;
  placement_type: string;
  days_count: number | null;
  daily_cost: number | null;
  total_cost: number | null;
}

export interface CampaignByIdCreative {
  id: string;
  placement_type: string;
  title: string | null;
  image_url: string | null;
  is_approved: boolean | null;
  rejection_reason: string | null;
  dimensions_width: number | null;
  dimensions_height: number | null;
  file_size: number | null;
}

export interface CampaignById {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  total_cost: number | null;
  rejected_reason: string | null;
  renewal_eligible: boolean | null;
  created_at: string;
  campaign_placements: CampaignByIdPlacement[];
  campaign_creatives: CampaignByIdCreative[];
}

const CAMPAIGN_COLUMNS = `
  id, name, status, start_date, end_date, total_cost, rejected_reason, renewal_eligible, created_at,
  campaign_placements (id, placement_type, days_count, daily_cost, total_cost),
  campaign_creatives (id, placement_type, title, image_url, is_approved, rejection_reason, dimensions_width, dimensions_height, file_size)
`;

/**
 * One of the signed-in user's campaigns, by id. Null when there is no such
 * campaign or it belongs to someone else; a failed read throws, so the page
 * can tell "not found" from "couldn't load".
 *
 * The key sits under ["campaigns", userId], so useCampaigns().refetch (which
 * invalidates that prefix after every RPC) refreshes this row too.
 */
export function useCampaignById(campaignId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["campaigns", user?.id, "one", campaignId],
    queryFn: async (): Promise<CampaignById | null> => {
      if (!user || !campaignId) return null;
      const { data, error } = await supabase
        .from("campaigns")
        .select(CAMPAIGN_COLUMNS)
        .eq("id", campaignId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as unknown as CampaignById;
      return {
        ...row,
        campaign_placements: row.campaign_placements ?? [],
        campaign_creatives: row.campaign_creatives ?? [],
      };
    },
    enabled: !!user && !!campaignId,
    staleTime: STALE_TIME.USER,
  });
}

/**
 * Days paid for: the sum of the stored placements' days_count when the
 * placements carry one (the trigger and checkout write it), otherwise the
 * inclusive span of the dates. Callers pass campaignDays for the fallback.
 */
export function paidDays(
  placements: Array<{ days_count: number | null }>,
  fallback: number | null,
): number | null {
  const counts = placements
    .map((p) => Number(p.days_count))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (counts.length === 0) return fallback;
  // Every placement runs over the same dates, so the campaign's length is the
  // longest placement, not the sum across placements.
  return Math.max(...counts);
}
