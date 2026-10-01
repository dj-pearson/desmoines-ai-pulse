import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * WEB-FEAT-014 — whether this user would actually be given the 7-day trial.
 *
 * The modal used to print "7-day free trial" unconditionally, including to an
 * Insider upgrading to VIP, who gets none. `useSubscription` cannot answer this
 * on its own: it only reads active/trialing/past_due rows, so a churned user —
 * the exact case the server now refuses a second trial for — looks identical to
 * a brand-new one there.
 *
 * So this asks the one question that matters, with no status or platform
 * filter: has a trial ever started on this account? It mirrors the server rule
 * in supabase/functions/_shared/trialEligibility.ts. The server is still the
 * authority; this only decides what the copy may promise.
 *
 * Anything short of a confirmed "never" reads as not eligible — a promise we
 * cannot verify is the defect, not the absence of one. An anonymous visitor is
 * the exception: there is no account to have consumed a trial, and the Pricing
 * page makes the same offer to them.
 */
export function useTrialEligibility() {
  const { user } = useAuth();

  const { data: hasUsedTrial, isLoading } = useQuery({
    queryKey: ["trial-eligibility", user?.id],
    queryFn: async (): Promise<boolean> => {
      if (!user) return false;

      const { count, error } = await supabase
        .from("user_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .not("trial_start", "is", null);

      if (error) throw error;
      return (count ?? 0) > 0;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  return {
    isEligibleForTrial: user ? hasUsedTrial === false : true,
    isLoading: !!user && isLoading,
  };
}
