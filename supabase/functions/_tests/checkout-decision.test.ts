import { strict as assert } from "node:assert";
import { decideCheckout, quoteFromUpcoming } from "../create-subscription-checkout/decision.ts";

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
  assert.deepEqual(outcome, { kind: "change_plan", stripeSubscriptionId: "sub_123", direction: "upgrade" });
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

/* ------------------------------------------------------------------------- *
 * Pricing plan WP5 items 2 and 3.
 * ------------------------------------------------------------------------- */

Deno.test("a past_due web row refuses a new checkout with billing_subscription_live", () => {
  // Stripe is still retrying that subscription. Selling a new one here is the
  // second live subscription the resubscribe-after-dunning path used to make.
  const outcome = decideCheckout({
    ...vipRequest,
    webSubscription: { plan_id: INSIDER, stripe_subscription_id: "sub_123", status: "past_due" },
    storeSubscriptions: [],
  });
  assert.equal(outcome.kind, "refuse");
  assert.equal(outcome.kind === "refuse" && outcome.code, "billing_subscription_live");
  assert.equal(outcome.kind === "refuse" && outcome.status, 409);
  assert.ok(outcome.kind === "refuse" && /payment method/.test(outcome.error));
});

Deno.test("past_due refuses the same plan too, and a plan change", () => {
  for (const plan_id of [VIP, INSIDER]) {
    const outcome = decideCheckout({
      ...vipRequest,
      webSubscription: { plan_id, stripe_subscription_id: "sub_123", status: "past_due" },
      storeSubscriptions: [],
      quoted: true,
    });
    assert.equal(outcome.kind === "refuse" && outcome.code, "billing_subscription_live");
  }
});

Deno.test("the store check still runs before past_due", () => {
  const outcome = decideCheckout({
    ...vipRequest,
    webSubscription: { plan_id: INSIDER, stripe_subscription_id: "sub_123", status: "past_due" },
    storeSubscriptions: [{ platform: "ios", subscription_plans: { sort_order: 2 } }],
  });
  assert.equal(outcome.kind === "refuse" && outcome.code, "store_subscription_active");
});

Deno.test("a lower-ranked plan is a downgrade", () => {
  const outcome = decideCheckout({
    ...insiderRequest,
    webSubscription: {
      plan_id: VIP,
      stripe_subscription_id: "sub_123",
      status: "active",
      subscription_plans: { sort_order: 2 },
    },
    storeSubscriptions: [],
  });
  assert.deepEqual(outcome, { kind: "change_plan", stripeSubscriptionId: "sub_123", direction: "downgrade" });
});

Deno.test("an unknown current rank reads as an upgrade, the legacy behaviour", () => {
  const outcome = decideCheckout({
    ...insiderRequest,
    webSubscription: { plan_id: VIP, stripe_subscription_id: "sub_123", status: "active" },
    storeSubscriptions: [],
  });
  assert.equal(outcome.kind === "change_plan" && outcome.direction, "upgrade");
});

Deno.test("monthly to yearly on the same plan is a change for a quoting client", () => {
  const outcome = decideCheckout({
    ...vipRequest,
    webSubscription: { plan_id: VIP, stripe_subscription_id: "sub_123", status: "active", billing_interval: "month" },
    storeSubscriptions: [],
    requestedInterval: "yearly",
    quoted: true,
  });
  assert.deepEqual(outcome, { kind: "change_plan", stripeSubscriptionId: "sub_123", direction: "interval" });
});

Deno.test("a cached bundle asking for the same plan still gets already_subscribed", () => {
  // Without preview or confirm there is no quote, so no change is made.
  const outcome = decideCheckout({
    ...vipRequest,
    webSubscription: { plan_id: VIP, stripe_subscription_id: "sub_123", status: "active", billing_interval: "month" },
    storeSubscriptions: [],
    requestedInterval: "yearly",
  });
  assert.equal(outcome.kind === "refuse" && outcome.code, "already_subscribed");
});

Deno.test("the same plan at the same interval, or an unknown one, is refused", () => {
  for (const billing_interval of ["month", null]) {
    const outcome = decideCheckout({
      ...vipRequest,
      webSubscription: { plan_id: VIP, stripe_subscription_id: "sub_123", status: "active", billing_interval },
      storeSubscriptions: [],
      requestedInterval: "monthly",
      quoted: true,
    });
    assert.equal(outcome.kind === "refuse" && outcome.code, "already_subscribed");
  }
});

// Unix seconds.
const RENEWAL = 1_793_000_000;
const NEXT_YEAR = RENEWAL + 365 * 86_400;

Deno.test("QUOTE: an upgrade charges the proration lines now, not the whole next invoice", () => {
  const quote = quoteFromUpcoming(
    {
      currency: "usd",
      amount_due: 1_999, // proration 700 + next period 1299: NOT what is due today
      lines: {
        data: [
          { amount: -250, proration: true },
          { amount: 950, proration: true },
          { amount: 1_299, proration: false, period: { start: RENEWAL, end: RENEWAL + 30 * 86_400 } },
        ],
      },
    },
    "upgrade",
    RENEWAL,
  );
  assert.equal(quote.code, "plan_change_quote");
  assert.equal(quote.amountDueNow, 700);
  assert.equal(quote.nextChargeAmount, 1_299);
  assert.equal(quote.nextChargeAt, new Date(RENEWAL * 1000).toISOString());
  assert.equal(quote.effective, "now");
  assert.equal(quote.currency, "usd");
});

Deno.test("QUOTE: a net credit is never shown as a negative charge", () => {
  const quote = quoteFromUpcoming(
    { lines: { data: [{ amount: -900, proration: true }, { amount: 499, proration: false }] } },
    "upgrade",
    RENEWAL,
  );
  assert.equal(quote.amountDueNow, 0);
});

Deno.test("QUOTE: a downgrade is due at period end, at the lower price", () => {
  const quote = quoteFromUpcoming({ currency: "usd", amount_due: 499, next_payment_attempt: RENEWAL, lines: { data: [] } }, "downgrade", RENEWAL);
  assert.equal(quote.amountDueNow, 0);
  assert.equal(quote.nextChargeAmount, 499);
  assert.equal(quote.nextChargeAt, new Date(RENEWAL * 1000).toISOString());
  assert.equal(quote.effective, "period_end");
});

Deno.test("QUOTE: an interval switch is invoiced now and renews a year later", () => {
  const quote = quoteFromUpcoming(
    {
      currency: "usd",
      amount_due: 12_000,
      lines: {
        data: [
          { amount: -990, proration: true },
          { amount: 12_990, proration: false, period: { start: RENEWAL - 20 * 86_400, end: NEXT_YEAR } },
        ],
      },
    },
    "interval",
    RENEWAL,
  );
  assert.equal(quote.amountDueNow, 12_000);
  assert.equal(quote.nextChargeAmount, 12_990);
  assert.equal(quote.nextChargeAt, new Date(NEXT_YEAR * 1000).toISOString());
  assert.equal(quote.effective, "now");
});
