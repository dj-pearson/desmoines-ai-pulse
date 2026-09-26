import { useQuery } from "@tanstack/react-query";
import { useAuthState } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("useReferralStats");

export interface ReferralStats {
  referralCode: string;
  signedUp: number;
}

/**
 * The signed-in user's referral code and how many sign-ups it brought in, from
 * get_my_referral_stats (20261006000002). null when the RPC is missing (the
 * migration is not applied yet) or answers nothing, so the caller can hide the
 * card instead of showing a code that does not exist.
 *
 * `subscribed` is not surfaced: nothing moves a referral to that status yet,
 * so it would always read 0.
 */
export function useReferralStats() {
  const { user } = useAuthState();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: ["referral-stats", userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<ReferralStats | null> => {
      const { data, error } = await supabase.rpc("get_my_referral_stats");
      if (error) {
        log.warn("fetch", "Referral stats unavailable", { code: error.code, message: error.message });
        return null;
      }
      const row = Array.isArray(data) ? data[0] : null;
      if (!row?.referral_code) return null;
      return { referralCode: row.referral_code, signedUp: Number(row.signed_up) || 0 };
    },
  });
}
