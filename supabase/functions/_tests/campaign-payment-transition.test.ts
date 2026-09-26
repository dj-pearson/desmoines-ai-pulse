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
  paymentRecordFromSession,
  promotionCodeOf,
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

Deno.test('verify-campaign-payment reports the row status, not a constant', async () => {
  const src = await read('supabase/functions/verify-campaign-payment/index.ts');
  assertFalse(/status: "pending_creative",\s*campaignId,/.test(src), 'the hardcoded answer is gone');
  assert(/status: currentStatus,/.test(src));
  assert(/\.eq\("status", "pending_payment"\)\s*\.select\("status"\)/.test(src), 'its own write is still scoped to pending_payment');
});

// --- WP6 item 3: what was paid is recorded ---

Deno.test('the record carries Stripe cents, the discount and the code', () => {
  const rec = paymentRecordFromSession({
    id: 'cs_1',
    amount_total: 6650,
    total_details: {
      amount_discount: 350,
      breakdown: { discounts: [{ amount: 350, discount: { promotion_code: { id: 'promo_1', code: 'SPRING5' } } }] },
    },
  });
  assertEquals(rec, { amount_paid_cents: 6650, amount_discount_cents: 350, promotion_code: 'SPRING5' });
});

Deno.test('an unexpanded promotion code is kept as its id, and no discount is null not zero', () => {
  assertEquals(
    promotionCodeOf({ id: 'cs_2', total_details: { breakdown: { discounts: [{ discount: { promotion_code: 'promo_9' } }] } } }),
    'promo_9',
  );
  assertEquals(promotionCodeOf({ id: 'cs_3', discounts: [{ promotion_code: 'promo_8' }] }), 'promo_8');
  const bare = paymentRecordFromSession({ id: 'cs_4', amount_total: 7000 });
  assertEquals(bare, { amount_paid_cents: 7000, amount_discount_cents: null, promotion_code: null });
  // A fully discounted checkout is 0, which is a real amount.
  assertEquals(paymentRecordFromSession({ id: 'cs_5', amount_total: 0 }).amount_paid_cents, 0);
});

Deno.test('the columns are additive and written outside the status update', async () => {
  const sql = await read('supabase/migrations/20261003000001_record_amount_paid.sql');
  for (const table of ['campaigns', 'user_subscriptions']) {
    for (const col of ['amount_paid_cents integer', 'amount_discount_cents integer', 'promotion_code text']) {
      assert(
        new RegExp(`ALTER TABLE public\\.${table}[\\s\\S]*?ADD COLUMN IF NOT EXISTS ${col}`).test(sql),
        `${table}.${col} must be added`,
      );
    }
  }
  assertFalse(/NOT NULL|DEFAULT/i.test(sql.replace(/--[^\n]*/g, '')), 'nullable, no default');

  const src = await read('supabase/functions/stripe-webhook/index.ts');
  const helper = src.slice(
    src.indexOf('async function recordCheckoutPayment('),
    src.indexOf('async function handleCampaignPayment('),
  );
  assert(helper.length > 0, 'recordCheckoutPayment must exist');
  assert(/if \(error\) \{\s*console\.error\(/.test(helper), 'a failed record is logged');
  assertFalse(/throw /.test(helper), 'and never thrown: Stripe would redeliver a processed payment forever');
  assert(/recordCheckoutPayment\(supabase, stripe, session, "campaigns"/.test(src));
  assert(/recordCheckoutPayment\(supabase, stripe, session, "user_subscriptions"/.test(src));
});
