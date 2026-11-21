import { beforeEach, describe, expect, it, vi } from "vitest";

const signUp = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signUp: (...a: unknown[]) => signUp(...a) } } }));

import { signUpWithPassword } from "@/lib/authActions";
import {
  REFERRAL_ATTRIBUTION_WINDOW_MS,
  REFERRAL_STORAGE_KEY,
  referralFromAccount,
  storeReferral,
  withStoredReferral,
} from "@/lib/referralStorage";
import { storage } from "@/lib/safeStorage";

/**
 * WEB-ADS-032. The invite code was kept only in the browser that opened the
 * ?ref link, so an email sign-up confirmed anywhere else (the mail app's
 * in-app browser, a phone) reached attribute_referral with nothing to send.
 */
describe("invite code on the account (WEB-ADS-032)", () => {
  beforeEach(() => {
    storage.remove(REFERRAL_STORAGE_KEY);
    signUp.mockReset();
    signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null });
  });

  it("email sign-up writes the stored invite code into the account metadata", async () => {
    storeReferral("ABCD2345");
    await signUpWithPassword("a@example.com", "pw-123456789", { first_name: "Ann" });
    expect(signUp).toHaveBeenCalledTimes(1);
    const options = signUp.mock.calls[0][0].options as { data?: Record<string, unknown> };
    expect(options.data).toEqual({ first_name: "Ann", referral_code: "ABCD2345" });
  });

  it("sign-up without a stored code sends the caller's metadata unchanged", async () => {
    const metadata = { first_name: "Ann" };
    await signUpWithPassword("a@example.com", "pw-123456789", metadata);
    const options = signUp.mock.calls[0][0].options as { data?: Record<string, unknown> };
    expect(options.data).toBe(metadata);
  });

  it("keeps a referral_code the caller already set", () => {
    storeReferral("ABCD2345");
    expect(withStoredReferral({ referral_code: "WXYZ2345" })).toEqual({ referral_code: "WXYZ2345" });
  });

  it("adds the code when the caller passed no metadata at all", () => {
    storeReferral("ABCD2345");
    expect(withStoredReferral(undefined)).toEqual({ referral_code: "ABCD2345" });
    storage.remove(REFERRAL_STORAGE_KEY);
    expect(withStoredReferral(undefined)).toBeUndefined();
  });

  it("reads the account code only inside the server's 24-hour window", () => {
    const now = Date.parse("2026-11-08T12:00:00Z");
    const user = (ageMs: number) => ({
      created_at: new Date(now - ageMs).toISOString(),
      user_metadata: { referral_code: "abcd2345" },
    });
    expect(referralFromAccount(user(0), now)).toBe("ABCD2345");
    expect(referralFromAccount(user(REFERRAL_ATTRIBUTION_WINDOW_MS - 1), now)).toBe("ABCD2345");
    expect(referralFromAccount(user(REFERRAL_ATTRIBUTION_WINDOW_MS), now)).toBeNull();
    expect(referralFromAccount({ user_metadata: { referral_code: "ABCD2345" } }, now)).toBeNull();
    expect(referralFromAccount({ created_at: new Date(now).toISOString(), user_metadata: { referral_code: "nope" } }, now)).toBeNull();
    expect(referralFromAccount(null, now)).toBeNull();
  });
});
