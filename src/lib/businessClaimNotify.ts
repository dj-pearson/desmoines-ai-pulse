import { supabase } from "@/integrations/supabase/client";

export type ClaimDecision = "approved" | "rejected" | "revoked";

/**
 * Email the claimant about an admin decision on their business claim
 * (WEB-ADS-047), through the notify-business-claim edge function.
 *
 * Only the claim id and the decision are sent. The function reads the
 * recipient (the claiming account's confirmed address) and the listing name
 * from the database and refuses a decision that does not match the claim's
 * current state, so callers must write the decision before calling.
 *
 * Never throws: the decision has already committed when this runs. Returns
 * whether the mail went out, so the admin can be told when the claimant was not.
 */
export async function notifyBusinessClaimDecision(claimId: string, decision: ClaimDecision): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke<{ sent?: boolean }>("notify-business-claim", {
      body: { claimId, decision },
    });
    return !error && data?.sent === true;
  } catch {
    return false;
  }
}
