import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { referralCountLabel } from "@/lib/referralCode";

/**
 * WEB-ADS-018. The invite card's count line, and the migration that makes its
 * paid half mean something.
 *
 * Before 20261107000105 nothing moved a referral to 'subscribed', so
 * get_my_referral_stats().subscribed was 0 for every member and the card
 * reasonably left it out. The trigger now moves a row when the referred member
 * starts an active paid plan on any platform; these cases pin the wording and
 * the trigger's three rules (active only, not the free plan, never fails the
 * subscription write).
 */
describe("referralCountLabel", () => {
  it("keeps the old sentence when nobody has subscribed", () => {
    expect(referralCountLabel({ signedUp: 0, subscribed: 0 })).toBe(
      "0 people have signed up through your link so far.",
    );
    expect(referralCountLabel({ signedUp: 1, subscribed: 0 })).toBe(
      "1 person has signed up through your link so far.",
    );
    expect(referralCountLabel({ signedUp: 4, subscribed: 0 })).toBe(
      "4 people have signed up through your link so far.",
    );
  });

  it("adds the paid count once there is one", () => {
    expect(referralCountLabel({ signedUp: 4, subscribed: 2 })).toBe(
      "4 people have signed up through your link so far; 2 went on to subscribe.",
    );
    expect(referralCountLabel({ signedUp: 1, subscribed: 1 })).toBe(
      "1 person has signed up through your link so far and went on to subscribe.",
    );
  });

  it("never prints more subscribers than sign-ups", () => {
    expect(referralCountLabel({ signedUp: 2, subscribed: 5 })).toBe(
      "2 people have signed up through your link so far; 2 went on to subscribe.",
    );
  });
});

describe("migration 20261107000105", () => {
  const sql = readFileSync(
    "supabase/migrations/20261107000105_referral_subscribed_on_paid_plan.sql",
    "utf8",
  ).replace(/^\s*--[^\n]*$/gm, "");

  it("fires on user_subscriptions for every platform, only for active rows", () => {
    expect(sql).toMatch(
      /AFTER INSERT OR UPDATE OF status, plan_id ON public\.user_subscriptions[\s\S]*?WHEN \(NEW\.status = 'active'\)/,
    );
    expect(sql).not.toMatch(/platform\s*=/);
  });

  it("counts a trial as not yet paid and skips the free plan", () => {
    expect(sql).not.toMatch(/trialing/);
    expect(sql).toMatch(/IF NEW\.status IS DISTINCT FROM 'active' THEN\s+RETURN NEW;/);
    expect(sql).toMatch(/sp\.name <> 'free'/);
  });

  it("only moves signed_up rows forward, never rewarded ones back", () => {
    expect(sql).toMatch(/SET status = 'subscribed'\s+WHERE referred_user_id = NEW\.user_id\s+AND status = 'signed_up'/);
  });

  it("cannot fail the subscription write it hangs off", () => {
    expect(sql).toMatch(/BEGIN\s+UPDATE public\.referrals[\s\S]*?EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/);
    expect(sql).not.toMatch(/RAISE EXCEPTION/);
  });

  it("is not callable by clients", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.mark_referral_subscribed\(\) FROM PUBLIC, anon, authenticated;/,
    );
  });
});
