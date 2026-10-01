/**
 * A refund returns at most what is left, and only a full one ends the
 * campaign (NON_CORE_REVIEW_2026-09 WP3).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/campaign-refund-cap.test.ts
 *
 * process-stripe-refund capped refunds at campaigns.total_cost (the list
 * price, before any promotion code), forgot earlier refunds, and set the
 * campaign 'refunded' on any refund at all, which stops the ads. The admin
 * refunds page read the payments table (not in production) and sent a body
 * the function rejects, so it could not refund anything.
 */
import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { refundDecision, refundNoticeText } from '../_shared/campaignPayment.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));

Deno.test('the default refund is whatever is left, and it is full', () => {
  assertEquals(refundDecision({ paidCents: 6650, refundedCents: 0 }), {
    ok: true,
    amountCents: 6650,
    full: true,
    remainingAfterCents: 0,
  });
});

Deno.test('a partial refund is not full and leaves the rest refundable', () => {
  const d = refundDecision({ paidCents: 6650, refundedCents: 0, requestedDollars: 10 });
  assertEquals(d, { ok: true, amountCents: 1000, full: false, remainingAfterCents: 5650 });
});

Deno.test('earlier refunds count against the cap', () => {
  const second = refundDecision({ paidCents: 6650, refundedCents: 1000, requestedDollars: 56.5 });
  assert(second.ok && second.full, 'refunding exactly the rest is full');
  const tooMuch = refundDecision({ paidCents: 6650, refundedCents: 1000, requestedDollars: 66.5 });
  assert(!tooMuch.ok);
  assertEquals(tooMuch.maxCents, 5650);
});

Deno.test('the cap is the paid amount, not the list price', () => {
  // $70 list, $3.50 promotion code: $66.50 was charged.
  const d = refundDecision({ paidCents: 6650, refundedCents: 0, requestedDollars: 70 });
  assert(!d.ok, 'refunding the list price after a discount would pay out money never taken');
});

Deno.test('nothing left, zero, negative and NaN are refused', () => {
  assertFalse(refundDecision({ paidCents: 6650, refundedCents: 6650 }).ok);
  assertFalse(refundDecision({ paidCents: 6650, refundedCents: 0, requestedDollars: 0 }).ok);
  assertFalse(refundDecision({ paidCents: 6650, refundedCents: 0, requestedDollars: -5 }).ok);
  assertFalse(refundDecision({ paidCents: 6650, refundedCents: 0, requestedDollars: Number.NaN }).ok);
});

Deno.test('cents are rounded once, from dollars', () => {
  const d = refundDecision({ paidCents: 1000, refundedCents: 0, requestedDollars: 0.1 + 0.2 });
  assert(d.ok && d.amountCents === 30);
});

Deno.test('the advertiser is told whether the campaign keeps running', () => {
  assert(/has ended/.test(refundNoticeText({ campaignName: 'Fall', amount: 66.5, full: true }).message));
  assert(/keeps running/.test(refundNoticeText({ campaignName: 'Fall', amount: 10, full: false }).message));
});

Deno.test('the function caps against Stripe and ends the campaign only on a full refund', async () => {
  const src = await read('supabase/functions/process-stripe-refund/index.ts');
  assert(/stripe\.paymentIntents\.retrieve\(/.test(src), 'the charge is read from Stripe');
  assert(/refundDecision\(\{/.test(src), 'and capped by refundDecision');
  assertFalse(/refundAmount > campaign\.total_cost/.test(src), 'the list-price cap is gone');

  const update = src.indexOf('.update({ status: "refunded" })');
  assert(update > 0);
  const guard = src.lastIndexOf('if (decision.full)', update);
  assert(guard > 0 && update - guard < 300, "'refunded' is written only inside the full-refund branch");

  const replay = src.indexOf('.eq("stripe_refund_id", refund.id)');
  const insert = src.indexOf('.from("refunds").insert(');
  assert(replay > 0 && replay < insert, 'a replayed idempotency key is caught before anything is recorded');
  assert(/notifyAdvertiserOfRefund\(supabase/.test(src), 'the advertiser is notified server-side');
});

Deno.test('the admin page lists campaigns and sends the body the function reads', async () => {
  const page = await read('src/pages/AdminRefunds.tsx');
  assertFalse(/fromUnknownTable\("payments"\)/.test(page), 'payments is not in production');
  assertFalse(/paymentId/.test(page), 'the function never read paymentId');
  assert(/\.from\("campaigns"\)/.test(page), 'refundable rows come from campaigns');
  assert(/campaignId,\s*amount,\s*reason,\s*refundReason,/.test(page), 'campaignId and refundReason are sent');
  assertFalse(/status: "approved"/.test(page), 'no status-only approval that moves no money');

  const hook = await read('src/hooks/useAdminCampaigns.ts');
  const fn = hook.slice(hook.indexOf('const processRefund = async ('));
  assert(/refundReason,/.test(fn.slice(0, 1200)), 'the hook sends refundReason');
  assertFalse(/notifyAdvertiser\(/.test(fn.slice(0, 2000)), 'and leaves the notice to the server');
});
