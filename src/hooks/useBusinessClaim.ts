import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Claiming a listing (WEB-ADS-009).
 *
 * Both calls are RPCs and neither writes business_claims directly, because a
 * direct insert would let the caller set status = 'verified' on their own row.
 * The table has no INSERT policy for ordinary users for that reason; the SELECT
 * policy is what lets this read the result back.
 *
 * `as never` until the types are regenerated with 20260920000005 - the house
 * pattern here. Until the migration is APPLIED the read 42P01s and the RPC
 * returns PGRST202; both are handled as "no claim", which renders the CTA and
 * reports a failure if it is pressed, rather than pretending success.
 */
export type ListingType = "restaurant" | "attraction" | "venue";
export type ClaimStatus = "pending" | "verified" | "rejected";

export interface BusinessClaim {
  id: string;
  listing_type: ListingType;
  listing_id: string;
  status: ClaimStatus;
  verified_at: string | null;
}

export function useBusinessClaim(listingType: ListingType, listingId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["business-claim", listingType, listingId, user?.id],
    enabled: !!user && !!listingId,
    // A claim changes only when this user acts, so there is nothing to poll for.
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<BusinessClaim | null> => {
      const { data, error } = await supabase
        .from("business_claims" as never)
        .select("id, listing_type, listing_id, status, verified_at")
        .eq("listing_type", listingType)
        .eq("listing_id", listingId!)
        .eq("user_id", user!.id)
        .maybeSingle();

      // Before the migration is applied this is 42P01. Reported as "no claim"
      // rather than thrown: the detail page must still render.
      if (error) {
        if (import.meta.env.DEV) console.error("business_claims read failed", error);
        return null;
      }
      return (data as unknown as BusinessClaim) ?? null;
    },
  });
}

export function useClaimListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      listingType,
      listingId,
    }: {
      listingType: ListingType;
      listingId: string;
    }): Promise<ClaimStatus> => {
      const { data, error } = await supabase.rpc("claim_listing" as never, {
        p_listing_type: listingType,
        p_listing_id: listingId,
      } as never);
      if (error) throw new Error(error.message);
      return data as unknown as ClaimStatus;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-claim"] });
    },
  });
}
