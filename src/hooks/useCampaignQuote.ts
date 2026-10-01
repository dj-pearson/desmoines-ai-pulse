import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PlacementType } from "@/lib/placementSpecs";

/**
 * The total for a set of placements over `days`, from the server (business
 * plan WP1 item 2).
 *
 * THIS IS THE CHECKOUT CALL, NOT A MIRROR OF IT. create-campaign-checkout
 * prices each placement with calculate_campaign_pricing(p_placement_type,
 * p_days_count) and refuses (409) to charge anything else. The page used to
 * compute its own figure with placementTotalPrice(), a copy of an overload
 * that a later migration dropped, so the summary and the charge came from two
 * formulas (WEB-ADS-003's shape). Asking the same function for the same days
 * is what lets the page say "This is the amount checkout charges."
 *
 * A missing or empty answer for any placement is an error, not a zero: a
 * partial total would be a number nobody charges.
 */

export interface QuoteLine {
  placement_type: PlacementType;
  total_price: number;
}

export interface CampaignQuote {
  lines: QuoteLine[];
  total: number;
  days: number;
}

async function quotePlacement(placement: PlacementType, days: number): Promise<QuoteLine> {
  const { data, error } = await supabase.rpc("calculate_campaign_pricing", {
    p_placement_type: placement,
    p_days_count: days,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  const total = Number(row?.total_price);
  if (!row || !Number.isFinite(total)) {
    throw new Error(`No price came back for ${placement}`);
  }
  return { placement_type: placement, total_price: total };
}

export async function fetchCampaignQuote(placements: PlacementType[], days: number): Promise<CampaignQuote> {
  const lines = await Promise.all(placements.map((p) => quotePlacement(p, days)));
  // Sum in cents so the total is the sum of the lines to the cent, the way
  // create-campaign-checkout adds them (to within its one-cent tolerance).
  const cents = lines.reduce((sum, line) => sum + Math.round(line.total_price * 100), 0);
  return { lines, total: cents / 100, days };
}

export function useCampaignQuote(placements: PlacementType[], days: number | null) {
  const key = [...placements].sort();
  return useQuery({
    queryKey: ["campaign-quote", key, days],
    queryFn: () => fetchCampaignQuote(key, days as number),
    enabled: key.length > 0 && days !== null && days >= 1,
    staleTime: 60 * 1000,
    retry: 1,
  });
}
