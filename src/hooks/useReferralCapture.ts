import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuthState } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/lib/logger";
import { normalizeReferralCode } from "@/lib/referralCode";
import {
  clearStoredReferral,
  readStoredReferral,
  referralFromAccount,
  storeReferral,
} from "@/lib/referralStorage";

// The storage helpers moved to src/lib/referralStorage.ts so authActions can
// read the code without importing this hook (and AuthContext with it).
// Re-exported so existing imports keep working.
export {
  clearStoredReferral,
  readStoredReferral,
  REFERRAL_STORAGE_KEY,
  REFERRAL_TTL_MS,
  storeReferral,
} from "@/lib/referralStorage";

const log = createLogger("useReferralCapture");

/**
 * Referral attribution (plan WP6).
 *
 * 1. Any page opened with ?ref=<code> stores the code, if it is in the code
 *    format, for 30 days. Nothing is sent: an anonymous visitor costs no
 *    request.
 * 2. Once a user is signed in and a code is stored, attribute_referral is
 *    called once for that user. The server decides everything that matters:
 *    the code exists, it is not the caller's own, the caller is not already
 *    someone's referral, and the account is under 24 hours old, so opening a
 *    friend's link cannot claim an existing member.
 * 3. With no stored code, the code written onto the account at sign-up is
 *    used instead (WEB-ADS-032), while the account is under 24 hours old. That
 *    is the email sign-up confirmed in another browser, which has the session
 *    but never saw the ?ref link.
 *
 * Attribution happens after sign-in rather than inside sign-up, so it covers
 * email and Google sign-up alike without touching AuthContext. The stored
 * code is cleared on any answer from the RPC. On a transport error (or before
 * migration 20261006000002 is applied) it is kept, and the next page load
 * tries again until it expires.
 */
export function useReferralCapture(): void {
  const { search } = useLocation();
  const { user } = useAuthState();
  const userId = user?.id ?? null;
  const attemptedFor = useRef<string | null>(null);

  useEffect(() => {
    const code = normalizeReferralCode(new URLSearchParams(search).get("ref"));
    if (code) storeReferral(code);
  }, [search]);

  useEffect(() => {
    if (!userId || attemptedFor.current === userId) return;
    const code = readStoredReferral() ?? referralFromAccount(user);
    if (!code) return;
    attemptedFor.current = userId;

    void (async () => {
      const { data, error } = await supabase.rpc("attribute_referral", { p_code: code });
      if (error) {
        log.warn("attribute", "Referral attribution failed; keeping the code", {
          code: error.code,
          message: error.message,
        });
        return;
      }
      clearStoredReferral();
      if (import.meta.env.DEV) log.debug("attribute", "Referral answered", { result: data });
    })();
    // `user` is read for its metadata and age only; userId is the identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, search]);
}
