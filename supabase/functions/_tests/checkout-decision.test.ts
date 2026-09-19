import { strict as assert } from "node:assert";
import { decideCheckout } from "../create-subscription-checkout/decision.ts";

const INSIDER = "plan-insider";
const VIP = "plan-vip";

const vipRequest = { requestedPlanId: VIP, requestedSortOrder: 2 };
const insiderRequest = { requestedPlanId: INSIDER, requestedSortOrder: 1 };

Deno.test("no subscription at all is a normal checkout", () => {
  const outcome = decideCheckout({ ...vipRequest, webSubscription: null, storeSubscriptions: [] });
  assert.deepEqual(outcome, { kind: "new_checkout" });
});

Deno.test("a different live web plan is a plan change, not a second purchase", () => {
  // What shipped before WEB-FEAT-013 opened a second Checkout session here,
  // which meant two live Stripe subscriptions and two invoices every month.
  const outcome = decideCheckout({
    ...vipRequest,
    webSubscription: { plan_id: INSIDER, stripe_subscription_id: "sub_123", status: "active" },
    storeSubscriptions: [],
  });
  assert.deepEqual(outcome, { kind: "change_plan", stripeSubscriptionId: "sub_123" });
});

Deno.test("the same plan is refused", () => {
  const outcome = decideCheckout({
    ...vipRequest,
    webSubscription: { plan_id: VIP, stripe_subscription_id: "sub_123", status: "active" },
    storeSubscriptions: [],
  });
  assert.equal(outcome.kind, "refuse");
  assert.equal(outcome.kind === "refuse" && outcome.code, "already_subscribed");
  assert.equal(outcome.kind === "refuse" && outcome.status, 409);
});

Deno.test("cancel_at_period_end asks the user to resume, BEFORE the same-plan check", () => {
  // Both are true of this row and only one is actionable: telling someone with
  // a pending cancellation "you already have this plan" leaves them with no
  // way to keep it.
  const outcome = decideCheckout({
    ...vipRequest,
    webSubscription: {
      plan_id: VIP,
      stripe_subscription_id: "sub_123",
      status: "active",
      cancel_at_period_end: true,
    },
    storeSubscriptions: [],
  });
  assert.equal(outcome.kind === "refuse" && outcome.code, "resume_required");
});

Deno.test("cancel_at_period_end also outranks the upgrade path", () => {
  const outcome = decideCheckout({
    ...vipRequest,
    webSubscription: {
      plan_id: INSIDER,
      stripe_subscription_id: "sub_123",
      cancel_at_period_end: true,
    },
    storeSubscriptions: [],
  });
  assert.equal(outcome.kind === "refuse" && outcome.code, "resume_required");
});

Deno.test("a store plan at the SAME rank blocks the sale", () => {
  // `>=`, not `>`. A strictly-greater test would allow selling the same tier
  // again on the web while the App Store is already charging for it.
  const outcome = decideCheckout({
    ...vipRequest,
    webSubscription: null,
    storeSubscriptions: [{ platform: "ios", subscription_plans: { sort_order: 2 } }],
  });
  assert.equal(outcome.kind === "refuse" && outcome.code, "store_subscription_active");
  assert.equal(outcome.kind === "refuse" && outcome.platform, "ios");
  assert.ok(outcome.kind === "refuse" && outcome.error.includes("the App Store"));
});

Deno.test("a store plan at a HIGHER rank blocks the sale", () => {
  const outcome = decideCheckout({
    ...insiderRequest,
    webSubscription: null,
    storeSubscriptions: [{ platform: "android", subscription_plans: { sort_order: 2 } }],
  });
  assert.equal(outcome.kind === "refuse" && outcome.code, "store_subscription_active");
  assert.ok(outcome.kind === "refuse" && outcome.error.includes("Google Play"));
});

Deno.test("a store plan at a LOWER rank does not block an upgrade on the web", () => {
  // Buying VIP on the web while holding Insider on iOS is a real upgrade, and
  // refusing it would leave the user with no way to take it.
  const outcome = decideCheckout({
    ...vipRequest,
    webSubscription: null,
    storeSubscriptions: [{ platform: "ios", subscription_plans: { sort_order: 1 } }],
  });
  assert.deepEqual(outcome, { kind: "new_checkout" });
});

Deno.test("the store check runs BEFORE the plan change", () => {
  // THE ORDER THAT MATTERS MOST. Reaching the upgrade path first would change
  // the price on a Stripe subscription belonging to a user who is also being
  // charged by Apple - a change nothing here can undo from the store side.
  const outcome = decideCheckout({
    ...vipRequest,
    webSubscription: { plan_id: INSIDER, stripe_subscription_id: "sub_123" },
    storeSubscriptions: [{ platform: "ios", subscription_plans: { sort_order: 2 } }],
  });
  assert.equal(outcome.kind === "refuse" && outcome.code, "store_subscription_active");
});

Deno.test("a live web row with no Stripe id falls through to a new checkout", () => {
  // A row written by something other than the webhook, or mid-write. Opening a
  // checkout is right: there is no subscription to change.
  const outcome = decideCheckout({
    ...vipRequest,
    webSubscription: { plan_id: INSIDER, stripe_subscription_id: null },
    storeSubscriptions: [],
  });
  assert.deepEqual(outcome, { kind: "new_checkout" });
});

Deno.test("a store row with no sort_order ranks 0 and blocks nothing", () => {
  // The join can come back without the plan. Treating an unknown rank as
  // blocking would refuse every checkout for anyone holding any store row.
  const outcome = decideCheckout({
    ...vipRequest,
    webSubscription: null,
    storeSubscriptions: [{ platform: "ios", subscription_plans: null }],
  });
  assert.deepEqual(outcome, { kind: "new_checkout" });
});

Deno.test("missing or null store rows are handled, not thrown on", () => {
  assert.deepEqual(
    decideCheckout({ ...vipRequest, webSubscription: null, storeSubscriptions: null }),
    { kind: "new_checkout" },
  );
  assert.deepEqual(
    decideCheckout({ ...vipRequest, webSubscription: undefined, storeSubscriptions: undefined }),
    { kind: "new_checkout" },
  );
});

Deno.test("every refusal is a 409 the client can branch on", () => {
  const codes = new Set<string>();
  for (const input of [
    { ...vipRequest, webSubscription: { plan_id: VIP }, storeSubscriptions: [] },
    { ...vipRequest, webSubscription: { plan_id: VIP, cancel_at_period_end: true }, storeSubscriptions: [] },
    {
      ...vipRequest,
      webSubscription: null,
      storeSubscriptions: [{ platform: "ios", subscription_plans: { sort_order: 9 } }],
    },
  ]) {
    const outcome = decideCheckout(input);
    assert.equal(outcome.kind, "refuse");
    if (outcome.kind === "refuse") {
      assert.equal(outcome.status, 409);
      assert.ok(outcome.error.length > 0);
      codes.add(outcome.code);
    }
  }
  assert.deepEqual(
    [...codes].sort(),
    ["already_subscribed", "resume_required", "store_subscription_active"],
  );
});
