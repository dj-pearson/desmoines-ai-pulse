import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isRpcMissing } from "@/hooks/useMyBusinessClaims";
import { parseListingStats, type ListingStats } from "@/lib/listingStats";

export type StatsListingType = "restaurant" | "attraction" | "venue";

/**
 * A verified owner's numbers for one listing (growth roadmap #3), from
 * get_listing_owner_stats (migration 20261102000004). The function refuses
 * anyone but the verified owner or an admin, so this is only enabled for a
 * verified claim.
 *
 * Returns `undefined` data, not an error, while the function is not deployed
 * (PGRST202): the panel then stays hidden rather than telling an owner their
 * stats are broken on the day the code ships ahead of the migration.
 */
export function useListingOwnerStats(
  listingType: StatsListingType,
  listingId: string,
  days: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["listing-owner-stats", listingType, listingId, days],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ListingStats | null> => {
      const { data, error } = await supabase.rpc("get_listing_owner_stats", {
        p_listing_type: listingType,
        p_listing_id: listingId,
        p_days: days,
      });
      if (error) {
        if (isRpcMissing(error)) return null;
        throw error;
      }
      const parsed = parseListingStats(data);
      if (!parsed) throw new Error("get_listing_owner_stats returned an unexpected shape");
      return parsed;
    },
  });
}
