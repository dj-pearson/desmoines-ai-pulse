import { normalizeReferralCode } from "@/lib/referralCode";
import { storage } from "@/lib/safeStorage";

/** safeStorage key for a ?ref seen on any page. New in plan WP6; not renamed from anything. */
export const REFERRAL_STORAGE_KEY = "dmi_referral_ref";

/** A stored ref is honoured for 30 days, then dropped unread. */
export const REFERRAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The sign-up metadata key that carries the invite code onto the account
 * (WEB-ADS-032). New; not renamed from anything.
 */
export const REFERRAL_METADATA_KEY = "referral_code";

/**
 * attribute_referral answers account_too_old once the account is 24 hours old
 * (20261006000002), so a code read from the account's metadata is only worth
 * sending inside that window.
 */
export const REFERRAL_ATTRIBUTION_WINDOW_MS = 24 * 60 * 60 * 1000;

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
 * Sign-up metadata with the stored invite code added (WEB-ADS-032).
 *
 * The code lives in this browser's storage, but an email sign-up finishes
 * wherever the confirmation link is opened: the mail app's in-app browser, or
 * a phone when the form was filled in on a laptop. That browser has no stored
 * code, so the invite was lost for exactly the people who did what the invite
 * asked. Written onto the account at sign-up, the code travels with it.
 *
 * Only ever a fallback input to attribute_referral, which still decides
 * everything (format, existence, self-referral, already attributed, account
 * age). A member editing their own metadata gains nothing they could not get
 * by opening a ?ref link. A caller that already set the key keeps its value.
 */
export function withStoredReferral(
  metadata: Record<string, unknown> | undefined,
  now = Date.now(),
): Record<string, unknown> | undefined {
  if (metadata && REFERRAL_METADATA_KEY in metadata) return metadata;
  const code = readStoredReferral(now);
  if (!code) return metadata;
  return { ...(metadata ?? {}), [REFERRAL_METADATA_KEY]: code };
}

/**
 * The invite code written onto the account at sign-up, while the account is
 * still young enough for attribute_referral to accept it; otherwise null.
 * Bounding it by age is what stops a signed-in member's every page load from
 * calling the RPC for good: the metadata cannot be cleared from here.
 */
export function referralFromAccount(
  user: { created_at?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined,
  now = Date.now(),
): string | null {
  if (!user) return null;
  const raw = user.user_metadata?.[REFERRAL_METADATA_KEY];
  const code = typeof raw === "string" ? normalizeReferralCode(raw) : null;
  if (!code) return null;
  const created = user.created_at ? Date.parse(user.created_at) : NaN;
  if (!Number.isFinite(created) || now - created >= REFERRAL_ATTRIBUTION_WINDOW_MS) return null;
  return code;
}
