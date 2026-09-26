import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuthState } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/lib/logger";
import { normalizeReferralCode } from "@/lib/referralCode";
import { storage } from "@/lib/safeStorage";

const log = createLogger("useReferralCapture");

/** safeStorage key for a ?ref seen on any page. New in plan WP6; not renamed from anything. */
export const REFERRAL_STORAGE_KEY = "dmi_referral_ref";

/** A stored ref is honoured for 30 days, then dropped unread. */
export const REFERRAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface StoredReferral {
  code: string;
  expiresAt: number;
}

/** Keep a ?ref code for later. The latest link wins. */
export function storeReferral(code: string, now = Date.now()): void {
  storage.set<StoredReferral>(REFERRAL_STORAGE_KEY, { code, expiresAt: now + REFERRAL_TTL_MS });
}

/** The stored code, or null when none, malformed or expired (an expired one is removed). */
export function readStoredReferral(now = Date.now()): string | null {
  const stored = storage.get<StoredReferral>(REFERRAL_STORAGE_KEY);
  if (!stored) return null;
  const code = normalizeReferralCode(stored.code);
  if (!code || typeof stored.expiresAt !== "number" || stored.expiresAt <= now) {
    storage.remove(REFERRAL_STORAGE_KEY);
    return null;
  }
  return code;
}

export function clearStoredReferral(): void {
  storage.remove(REFERRAL_STORAGE_KEY);
}

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
    const code = readStoredReferral();
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
  }, [userId, search]);
}
