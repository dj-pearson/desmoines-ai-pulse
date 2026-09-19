/**
 * Stripe status -> stored status -> entitled tier, end to end (WEB-CI-029 AC2).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/subscription-status-entitlement.test.ts
 *
 * THE MONEY PATH HAD NO TEST THAT CROSSED ITS OWN SEAM. stripe-webhook decides
 * what a Stripe status becomes in user_subscriptions; _shared/entitlements.ts
 * reads that column back and decides whether someone is entitled. Each side was
 * plausible alone, and nothing checked them together - so a status the webhook
 * writes but isSubscriptionRowEntitled does not recognise would lock out a
 * paying customer with no failure anywhere. A grep for checkout|stripe|pricing
 * across tests/ hits two lines, both field validation.
 *
 * node:assert rather than std/assert: no network, so this runs in a container
 * where deno.land is unreachable as well as in CI.
 */

import { strict as assert } from 'node:assert';
import {
  mapStripeStatus,
  subscriptionUpdatePatch,
  webSubscriptionRow,
  type StripeSubscriptionLike,
} from '../_shared/stripeSubscriptionRow.ts';
import { resolveEntitledTier, isSubscriptionRowEntitled } from '../_shared/entitlements.ts';

const SECOND = 1;
const DAY = 86400;
const NOW = new Date('2026-09-19T12:00:00Z');
const nowSec = Math.floor(NOW.getTime() / 1000);

function sub(over: Partial<StripeSubscriptionLike> = {}): StripeSubscriptionLike {
  return {
    id: 'sub_123',
    status: 'active',
    current_period_start: nowSec - 30 * DAY,
    current_period_end: nowSec + 30 * DAY,
    cancel_at_period_end: false,
    items: { data: [{ price: { recurring: { interval: 'month' } } }] },
    ...over,
  };
}

/** A from() that answers resolveEntitledTier's one query with these rows. */
function fakeSupabase(rows: unknown[]) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => Promise.resolve({ data: rows, error: null }),
  };
  return { from: () => builder };
}

/** What the webhook would store, then what entitlements makes of it. */
async function tierFor(stripeStatus: string, planName: string, periodEndSec: number) {
  const row = webSubscriptionRow({
    userId: 'u1',
    planId: 'plan_1',
    subscription: sub({ status: stripeStatus, current_period_end: periodEndSec }),
    stripeCustomerId: 'cus_1',
  });
  const supabase = fakeSupabase([
    {
      status: row.status,
      current_period_end: row.current_period_end,
      plan: { name: planName },
    },
  ]);
  // deno-lint-ignore no-explicit-any
  return await resolveEntitledTier(supabase as any, 'u1', NOW);
}

Deno.test('every Stripe status maps to the documented stored status', () => {
  // Pinned so a change to the MAP is visible in review. The fall-through below
  // is a separate decision with its own test.
  assert.equal(mapStripeStatus('active'), 'active');
  assert.equal(mapStripeStatus('trialing'), 'trialing');
  assert.equal(mapStripeStatus('past_due'), 'past_due');
  assert.equal(mapStripeStatus('unpaid'), 'past_due');
  assert.equal(mapStripeStatus('incomplete'), 'past_due');
  assert.equal(mapStripeStatus('canceled'), 'canceled');
  assert.equal(mapStripeStatus('incomplete_expired'), 'canceled');
  assert.equal(mapStripeStatus('paused'), 'paused');
});

Deno.test('an unknown Stripe status falls through to active, deliberately', () => {
  // Stated rather than assumed: the default grants entitlement. It avoids
  // locking out a paying customer when Stripe adds a status, and it is the
  // reason the map above is pinned - a silent change there is the real risk.
  assert.equal(mapStripeStatus('some_future_status'), 'active');
  assert.equal(mapStripeStatus(''), 'active');
});

Deno.test('AC2: trialing, active and past_due entitle; canceled and paused do not', async () => {
  const future = nowSec + 30 * DAY;
  assert.equal(await tierFor('trialing', 'VIP', future), 'vip');
  assert.equal(await tierFor('active', 'VIP', future), 'vip');
  assert.equal(await tierFor('active', 'Insider', future), 'insider');
  assert.equal(await tierFor('past_due', 'Insider', future), 'insider');

  // The two that must NOT: entitlements only queries active/trialing/past_due,
  // and the fake answers with whatever it is given, so this asserts the
  // ROW-level rule rather than the query filter.
  assert.equal(await tierFor('canceled', 'VIP', future), 'free');
  assert.equal(await tierFor('paused', 'VIP', future), 'free');
});

Deno.test('past_due keeps entitlement through the grace window and not past it', () => {
  // The seam that matters: mapStripeStatus turns FOUR Stripe statuses into
  // past_due (past_due, unpaid, incomplete), and past_due is the only stored
  // status whose entitlement depends on a date.
  const endedYesterday = new Date(NOW.getTime() - DAY * 1000).toISOString();
  const endedLongAgo = new Date(NOW.getTime() - 60 * DAY * 1000).toISOString();

  assert.equal(isSubscriptionRowEntitled('past_due', endedYesterday, NOW), true);
  assert.equal(isSubscriptionRowEntitled('past_due', endedLongAgo, NOW), false);
  // No period end at all is not a grace window.
  assert.equal(isSubscriptionRowEntitled('past_due', null, NOW), false);
});

Deno.test('the checkout row carries platform web', () => {
  // Load-bearing: handleSubscriptionPayment scopes both its read and its UPDATE
  // on platform='web' so an iOS or Android row for the same user is untouched.
  // A row written without it would be invisible to that scoping and become a
  // second, unreachable subscription.
  const row = webSubscriptionRow({
    userId: 'u1',
    planId: 'plan_1',
    subscription: sub(),
    stripeCustomerId: 'cus_1',
  });
  assert.equal(row.platform, 'web');
  assert.equal(row.user_id, 'u1');
  assert.equal(row.stripe_subscription_id, 'sub_123');
});

Deno.test('trial fields survive the mapping, and absent ones are null not undefined', () => {
  // WEB-LEGAL-006 reads trial_end to state the real renewal amount. `undefined`
  // is dropped by JSON.stringify, so a column that should be cleared would keep
  // its old value on an UPDATE instead.
  const trialing = webSubscriptionRow({
    userId: 'u1',
    planId: 'plan_1',
    subscription: sub({ status: 'trialing', trial_start: nowSec, trial_end: nowSec + 14 * DAY }),
    stripeCustomerId: 'cus_1',
  });
  assert.equal(trialing.status, 'trialing');
  assert.equal(typeof trialing.trial_end, 'string');

  const noTrial = webSubscriptionRow({
    userId: 'u1',
    planId: 'plan_1',
    subscription: sub(),
    stripeCustomerId: 'cus_1',
  });
  assert.equal(noTrial.trial_start, null);
  assert.equal(noTrial.trial_end, null);
});

Deno.test('billing_interval comes through, and is null when Stripe omits it', () => {
  assert.equal(billingOf('month'), 'month');
  assert.equal(billingOf('year'), 'year');

  const none = webSubscriptionRow({
    userId: 'u1',
    planId: 'plan_1',
    subscription: { ...sub(), items: undefined },
    stripeCustomerId: 'cus_1',
  });
  assert.equal(none.billing_interval, null);

  function billingOf(interval: string) {
    return webSubscriptionRow({
      userId: 'u1',
      planId: 'plan_1',
      subscription: sub({ items: { data: [{ price: { recurring: { interval } } }] } }),
      stripeCustomerId: 'cus_1',
    }).billing_interval;
  }
});

Deno.test('the update patch does NOT carry identity columns', () => {
  // customer.subscription.updated is keyed on stripe_subscription_id. Sending
  // user_id, plan_id or platform in that patch would let a malformed event
  // rewrite who the subscription belongs to.
  const patch = subscriptionUpdatePatch(sub({ status: 'past_due', canceled_at: nowSec }));
  for (const forbidden of ['user_id', 'plan_id', 'platform', 'stripe_customer_id']) {
    assert.equal(forbidden in patch, false, `${forbidden} must not be in the update patch`);
  }
  assert.equal(patch.status, 'past_due');
  assert.equal(typeof patch.canceled_at, 'string');
});

Deno.test('the webhook uses the shared mapping rather than its own copy', async () => {
  // The rules above are correct and irrelevant if stripe-webhook rebuilds the
  // row inline again - which is exactly the state this story found it in.
  const src = await Deno.readTextFile(
    new URL('../stripe-webhook/index.ts', import.meta.url),
  );
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*$/gm, '');

  assert.ok(/webSubscriptionRow\(/.test(code), 'the checkout row must come from the shared builder');
  assert.ok(/subscriptionUpdatePatch\(/.test(code), 'the update patch must come from the shared builder');
  assert.ok(
    !/function\s+mapStripeStatus\s*\(/.test(code),
    'stripe-webhook has its own mapStripeStatus again',
  );
  assert.ok(
    !/platform:\s*["']web["']/.test(code),
    'the row is being rebuilt inline in stripe-webhook',
  );
});
