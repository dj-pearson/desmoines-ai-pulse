/**
 * A paid checkout moves a campaign forward once, and only from unpaid
 * (NON_CORE_REVIEW_2026-09 WP3 item 1, business plan D9).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/campaign-payment-transition.test.ts
 *
 * handleCampaignPayment matched its UPDATE on stripe_session_id alone, so a
 * late or redelivered checkout.session.completed moved an ACTIVE campaign back
 * to pending_creative and took its ads down, and re-sent "Payment Confirmed".
 * It also advanced on a session whose payment_status was 'unpaid' (an async
 * method that had not settled).
 *
 * The decision is unit-tested; the wiring is pinned textually because the
 * webhook imports Stripe from esm.sh and cannot be loaded here.
 */
import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  campaignPaymentDecision,
  PAID_CAMPAIGN_STATUS,
  PAYABLE_CAMPAIGN_STATUSES,
  shouldAnnouncePayment,
} from '../_shared/campaignPayment.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));

Deno.test('only a paid session advances a campaign', () => {
  assertEquals(campaignPaymentDecision({ payment_status: 'paid' }, 'c1'), { advance: true });
  assertEquals(campaignPaymentDecision({ payment_status: 'unpaid' }, 'c1'), {
    advance: false,
    reason: 'not_paid',
  });
  assertEquals(campaignPaymentDecision({ payment_status: 'no_payment_required' }, 'c1'), {
    advance: false,
    reason: 'not_paid',
  });
  assertEquals(campaignPaymentDecision({ payment_status: null }, 'c1'), {
    advance: false,
    reason: 'not_paid',
  });
  assertEquals(campaignPaymentDecision({ payment_status: 'paid' }, ''), {
    advance: false,
    reason: 'no_campaign',
  });
});

Deno.test('only draft and pending_payment are payable, and payment leads to pending_creative', () => {
  assertEquals([...PAYABLE_CAMPAIGN_STATUSES].sort(), ['draft', 'pending_payment']);
  assertEquals(PAID_CAMPAIGN_STATUS, 'pending_creative');
  for (const live of ['active', 'paused', 'pending_creative', 'pending_review', 'completed', 'refunded', 'cancelled']) {
    assertFalse(
      (PAYABLE_CAMPAIGN_STATUSES as readonly string[]).includes(live),
      `${live} must not be moved by a payment event`,
    );
  }
});

Deno.test('a replay that matches no row announces nothing', () => {
  assertFalse(shouldAnnouncePayment(0));
  assert(shouldAnnouncePayment(1));
});

Deno.test('the webhook wires the decision into its UPDATE and stops on zero rows', async () => {
  const src = await read('supabase/functions/stripe-webhook/index.ts');
  const start = src.indexOf('async function handleCampaignPayment(');
  const end = src.indexOf('async function handleSubscriptionPayment(');
  assert(start > 0 && end > start, 'handleCampaignPayment must exist');
  const fn = src.slice(start, end);

  const decide = fn.indexOf('campaignPaymentDecision(session, campaignId)');
  const update = fn.indexOf('.from("campaigns")\n    .update(');
  assert(decide > 0, 'the payment_status check must run');
  assert(update > decide, 'and run before the campaign is touched');
  assert(/\.in\("status", \[\.\.\.PAYABLE_CAMPAIGN_STATUSES\]\)/.test(fn), 'the UPDATE must be scoped to the payable statuses');
  assert(/\.eq\("stripe_session_id", session\.id\)/.test(fn), 'and still to this session');
  assert(/\.select\("id"\)/.test(fn), 'and report which rows moved');

  const guard = fn.indexOf('shouldAnnouncePayment(');
  const notify = fn.indexOf('campaign_notifications');
  assert(guard > update && notify > guard, 'no notification may be written before the zero-row check');
  assertFalse(/\.from\("payments"\)/.test(fn), 'the payments upsert targets a table production does not have');
});
