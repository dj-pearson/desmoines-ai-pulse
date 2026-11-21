import { strict as assert } from "node:assert";
import {
  businessProMetadata,
  businessProTargetFromMetadata,
  businessSubscriptionPatch,
  isBusinessProInvoice,
  isBusinessProMetadata,
  parseCheckoutRequest,
} from "../_shared/businessPro.ts";

/**
 * Business Pro (growth roadmap #3, part 2). The failure this suite exists to
 * prevent is a Business Pro subscription being read as a reader plan, or the
 * reverse: one person can hold both, and stripe-webhook decides which table a
 * Stripe event belongs to from these functions.
 */

const T = {
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  listingType: "restaurant" as const,
  listingId: "11111111-1111-4111-8111-111111111111",
  businessPlanId: "22222222-2222-4222-8222-222222222222",
};

Deno.test("checkout metadata is marked business_pro and never carries planId", () => {
  const m = businessProMetadata(T);
  assert.equal(m.kind, "business_pro");
  // stripe-webhook's reader branch matches userId && planId. Without planId a
  // Business Pro session can never fall into it.
  assert.equal("planId" in m, false);
  assert.equal(isBusinessProMetadata(m), true);
});

Deno.test("reader-plan metadata is not business_pro", () => {
  assert.equal(isBusinessProMetadata({ userId: T.userId, planId: "p1", planName: "insider" }), false);
  assert.equal(isBusinessProMetadata(null), false);
  assert.equal(isBusinessProMetadata(undefined), false);
});

Deno.test("a target round-trips through metadata", () => {
  assert.deepEqual(businessProTargetFromMetadata(businessProMetadata(T)), T);
});

Deno.test("malformed metadata gives no target rather than a half-filled row", () => {
  const m = businessProMetadata(T);
  assert.equal(businessProTargetFromMetadata({ ...m, listingId: "not-a-uuid" }), null);
  assert.equal(businessProTargetFromMetadata({ ...m, listingType: "venue" }), null);
  assert.equal(businessProTargetFromMetadata({ ...m, kind: "other" }), null);
  const { userId: _drop, ...noUser } = m;
  assert.equal(businessProTargetFromMetadata(noUser), null);
});

Deno.test("the browser's request names a listing and an action, never an amount", () => {
  assert.deepEqual(parseCheckoutRequest({ listingType: "restaurant", listingId: T.listingId }), {
    action: "checkout",
    listingType: "restaurant",
    listingId: T.listingId,
  });
  assert.deepEqual(parseCheckoutRequest({ action: "portal", listingType: "attraction", listingId: T.listingId.toUpperCase() }), {
    action: "portal",
    listingType: "attraction",
    listingId: T.listingId,
  });
  // An amount in the body is simply not read.
  const withAmount = parseCheckoutRequest({ listingType: "restaurant", listingId: T.listingId, amount: 1 });
  assert.equal("amount" in withAmount, false);
});

Deno.test("bad requests are refused with a reason", () => {
  for (const body of [null, [], "x", { listingType: "venue", listingId: T.listingId }, { listingType: "restaurant", listingId: "nope" }, { action: "refund", listingType: "restaurant", listingId: T.listingId }]) {
    const r = parseCheckoutRequest(body);
    assert.ok("error" in r, JSON.stringify(body));
  }
});

Deno.test("the row reflects what Stripe last said", () => {
  const now = new Date("2026-11-07T12:00:00Z");
  const patch = businessSubscriptionPatch(
    { id: "sub_1", status: "past_due", cancel_at_period_end: true, current_period_end: 1795000000, customer: { id: "cus_1" } },
    now,
  );
  assert.deepEqual(patch, {
    status: "past_due",
    cancel_at_period_end: true,
    current_period_end: new Date(1795000000 * 1000).toISOString(),
    stripe_customer_id: "cus_1",
    updated_at: now.toISOString(),
  });
  const bare = businessSubscriptionPatch({ id: "sub_2", status: "canceled", customer: "cus_2" }, now);
  assert.equal(bare.current_period_end, null);
  assert.equal(bare.cancel_at_period_end, false);
  assert.equal(bare.stripe_customer_id, "cus_2");
});

Deno.test("an invoice is Business Pro by its metadata, or by a row we already hold", () => {
  const bp = { subscription_details: { metadata: businessProMetadata(T) } };
  const reader = { subscription_details: { metadata: { userId: T.userId, planId: "p" } } };
  assert.equal(isBusinessProInvoice(bp, false), true);
  assert.equal(isBusinessProInvoice(reader, false), false);
  // First invoice before the checkout event wrote the row, or an invoice
  // without subscription_details: the table lookup decides.
  assert.equal(isBusinessProInvoice({}, true), true);
  assert.equal(isBusinessProInvoice({ subscription_details: null }, false), false);
});

// ---------------------------------------------------------------------------
// Source contracts. These read the function files, because what matters is
// ORDER and ORIGIN: the price comes from the server, and Business Pro is
// routed before any reader-plan code runs. Each has a counter-assertion that
// the thing it orders against is really there, so a rename cannot turn the
// check into one that passes on nothing.
// ---------------------------------------------------------------------------

const REPO = new URL("../../../", import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));

Deno.test("checkout charges the plan row's Stripe price, never a value from the request", async () => {
  const src = await read("supabase/functions/create-business-pro-checkout/index.ts");
  assert.match(src, /\.from\("business_plans"\)/);
  assert.match(src, /line_items: \[\{ price: plan\.stripe_price_id_monthly, quantity: 1 \}\]/);
  assert.match(src, /parseCheckoutRequest\(body\)/);
  // The parsed request is the only thing read from the body.
  assert.doesNotMatch(src, /body\.(amount|price|priceId|planId)/);
  // An unset price refuses rather than charging.
  assert.match(src, /if \(!plan\?\.stripe_price_id_monthly\)/);
});

Deno.test("checkout requires a verified claim before it creates a session", async () => {
  const src = await read("supabase/functions/create-business-pro-checkout/index.ts");
  const claim = src.indexOf('.eq("status", "verified")');
  const create = src.indexOf("stripe.checkout.sessions.create(");
  assert.ok(claim > 0, "the verified-claim check exists");
  assert.ok(create > 0, "the session create exists");
  assert.ok(claim < create, "the claim is checked before any session is created");
});

Deno.test("the webhook routes Business Pro before the campaign and reader-plan branches", async () => {
  const src = await read("supabase/functions/stripe-webhook/index.ts");
  const fn = src.slice(src.indexOf("async function handleCheckoutSessionCompleted("));
  const bp = fn.indexOf("if (isBusinessProMetadata(metadata))");
  const campaign = fn.indexOf("if (metadata.campaignId)");
  const reader = fn.indexOf("metadata.userId && metadata.planId");
  assert.ok(bp > 0 && campaign > 0 && reader > 0, "all three branches exist");
  assert.ok(bp < campaign && bp < reader, "Business Pro is decided first");
});

Deno.test("subscription updates for Business Pro return before user_subscriptions is touched", async () => {
  const src = await read("supabase/functions/stripe-webhook/index.ts");
  const fn = src.slice(src.indexOf("async function handleSubscriptionUpdated("));
  const bp = fn.indexOf("if (isBusinessProMetadata(subscription.metadata))");
  const reader = fn.indexOf('.from("user_subscriptions")');
  assert.ok(bp > 0 && reader > 0, "both paths exist");
  assert.ok(bp < reader, "Business Pro returns first");
});

Deno.test("a reader-plan checkout leaves an open Business Pro checkout alone", async () => {
  const src = await read("supabase/functions/create-subscription-checkout/index.ts");
  assert.match(src, /if \(other\.metadata\?\.kind === "business_pro"\) continue;/);
  assert.match(src, /stripe\.checkout\.sessions\.expire\(other\.id\)/);
});

Deno.test("deleting an account cancels Business Pro billing before anything is erased", async () => {
  const src = await read("supabase/functions/delete-user-account/index.ts");
  const read_ = src.indexOf('.from("business_subscriptions")');
  const cancel = src.indexOf("await cancelBillingBeforeErasure(");
  const purge = src.indexOf("PURGE_TABLES", cancel);
  assert.ok(read_ > 0 && cancel > 0 && purge > 0, "the read, the cancel and the purge exist");
  assert.ok(read_ < cancel && cancel < purge, "Business Pro rows are read and cancelled before the purge");
  assert.match(src.slice(cancel, purge), /businessRows/);
});
