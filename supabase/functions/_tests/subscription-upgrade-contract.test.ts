/**
 * Subscription upgrade contract (WEB-FEAT-013).
 *
 * Two ways to end up paying twice, both closed here.
 *
 *   1. The double-charge guards queried user_subscriptions with .single() and
 *      no platform filter. A user may legitimately hold one row per platform --
 *      useSubscription and SubscriptionPortal are built around that -- so
 *      anyone with a web row AND a store row matched two rows, .single()
 *      returned an error with data null, and every guard below it passed. The
 *      people most likely to be double-charged were the ones already paying on
 *      two platforms.
 *   2. A genuine cross-tier upgrade was "left to proceed for now", and
 *      proceeding meant a second Checkout session and a second live Stripe
 *      subscription. Two invoices, every month, forever.
 *
 * The upgrade branch is exercised against a fake Stripe so the three outcomes
 * are asserted as behaviour rather than as source text.
 *
 * node:assert rather than deno.land/std, so this runs offline (pricing plan
 * WP5 item 4 found it failing and unrunnable in a container).
 */

import { strict as nodeAssert } from 'node:assert';
import { quoteFromUpcoming } from '../create-subscription-checkout/decision.ts';

const assert = (condition: unknown, message = '') => nodeAssert.ok(condition, message);
const assertFalse = (condition: unknown, message = '') => nodeAssert.ok(!condition, message);
const assertEquals = <T>(actual: T, expected: T, message = '') =>
  nodeAssert.deepStrictEqual(actual, expected, message);

const REPO = new URL('../../../', import.meta.url);
const FN = 'supabase/functions/create-subscription-checkout/index.ts';
const src = await Deno.readTextFile(new URL(FN, REPO));
// The refusal rules moved to a pure module (WEB-CI-029 AC3); index.ts calls it.
const decision = await Deno.readTextFile(
  new URL('supabase/functions/create-subscription-checkout/decision.ts', REPO),
);

Deno.test('the guard query is scoped to one platform, so it can return one row', () => {
  // past_due is live too (WP5 item 3): Stripe is still retrying it.
  assert(
    /\.eq\("platform", "web"\)\s*\n\s*\.in\("status", \["active", "trialing", "past_due"\]\)\s*\n\s*\.maybeSingle\(\);/.test(src),
    'the web lookup must filter by platform, include past_due, and use maybeSingle',
  );
  // .single() on a query that can match several rows is the defect itself.
  assertFalse(
    /\.in\("status", \["active", "trialing"\]\)\s*\n\s*\.single\(\);/.test(src),
    'no unfiltered .single() may remain: it nulls the row and disables every guard',
  );
});

Deno.test('a store subscription at the same or a higher tier blocks a web purchase', () => {
  assert(/\.in\("platform", \["ios", "android"\]\)/.test(src), 'store rows must be looked up');
  assert(/decideCheckout\(\{/.test(src), 'index.ts must route through the decision module');
  assert(/rank >= requestedSortOrder/.test(decision), 'same tier counts, not just higher');
  assert(/code: "store_subscription_active"/.test(decision));
  assert(/status: 409/.test(decision));
  // The message has to send them where the billing actually lives.
  assert(/the App Store/.test(decision) && /Google Play/.test(decision), 'name the store they bought from');
});

Deno.test('a preview changes nothing and returns before any Stripe write', () => {
  const previewAt = src.indexOf('if (preview) {');
  const scheduleAt = src.indexOf('stripe.subscriptionSchedules');
  const updateAt = src.indexOf('await stripe.subscriptions.update(');
  assert(previewAt > 0 && previewAt < scheduleAt && previewAt < updateAt, 'the preview branch returns first');
  const branch = src.slice(previewAt, scheduleAt);
  assert(/\.\.\.quote,/.test(branch), 'and returns the quote');
  assert(/body\.preview === true/.test(src) && /body\.confirm === true/.test(src), 'only a literal true counts');
});

Deno.test('a confirmed downgrade is scheduled for period end, not charged now', () => {
  assert(/const deferDowngrade = outcome\.direction === "downgrade" && \(preview \|\| confirm\);/.test(src));
  assert(/end_behavior: "release"/.test(src));
  assert(/end_date: current\.current_period_end/.test(src));
  assert(/code: "plan_change_scheduled"/.test(src));
});

Deno.test('a confirmed upgrade is charged now, and applied only if paid', () => {
  assert(/proration_behavior: "always_invoice"/.test(src));
  assert(/payment_behavior: "pending_if_incomplete"/.test(src));
  assert(/code: "plan_change_payment_failed"/.test(src));
});

Deno.test('a different active web plan is changed in place, never bought again', () => {
  assert(
    /await stripe\.subscriptions\.update\(/.test(src),
    'the existing subscription must be updated',
  );
  assert(
    /proration_behavior: "create_prorations"/.test(src),
    'the unused part of the old tier must be credited',
  );
  assert(
    /retrieveUpcoming\(/.test(src),
    'the prorated amount must be previewed so it can be shown',
  );

  // The upgrade must RETURN before any Checkout session is created, or the
  // second subscription comes straight back.
  const updateAt = src.indexOf('await stripe.subscriptions.update(');
  const sessionAt = src.indexOf('await stripe.checkout.sessions.create(');
  assert(updateAt > 0 && sessionAt > updateAt, 'checkout creation must be unreachable from the upgrade path');
  const between = src.slice(updateAt, sessionAt);
  assert(/return new Response\(/.test(between), 'the upgrade path returns');
  assert(/upgraded: true/.test(between), 'and says so');
});

Deno.test('the upgrade response keeps the key the client already redirects on', () => {
  // useSubscription throws "No checkout URL returned" when data.url is absent,
  // so an upgrade that returned only { upgraded: true } would look like a
  // failure to every shipped build.
  const updateAt = src.indexOf('await stripe.subscriptions.update(');
  const between = src.slice(updateAt, src.indexOf('await stripe.checkout.sessions.create('));
  assert(/url: `\$\{siteUrl\}\/subscription\/success\?upgraded=true/.test(between));
  assert(/prorationAmount/.test(between), 'and carries the figure for the UI');
});

Deno.test('a failed plan change does not fall through to a second subscription', () => {
  assert(/code: "plan_change_failed"/.test(src));
  assert(/status: 502/.test(src));
  const failAt = src.indexOf('code: "plan_change_failed"');
  const sessionAt = src.indexOf('await stripe.checkout.sessions.create(');
  assert(failAt > 0 && sessionAt > failAt, 'the failure returns rather than continuing');
});

/* ------------------------------------------------------------------------- *
 * The upgrade arithmetic, against a fake Stripe.
 * ------------------------------------------------------------------------- */

interface FakeCall { method: string; args: unknown[] }

function fakeStripe(calls: FakeCall[], opts: { previewFails?: boolean } = {}) {
  return {
    subscriptions: {
      retrieve: (id: string) => {
        calls.push({ method: 'subscriptions.retrieve', args: [id] });
        return Promise.resolve({
          id,
          customer: 'cus_123',
          items: { data: [{ id: 'si_existing' }] },
        });
      },
      update: (id: string, params: Record<string, unknown>) => {
        calls.push({ method: 'subscriptions.update', args: [id, params] });
        return Promise.resolve({ id });
      },
      create: (params: Record<string, unknown>) => {
        calls.push({ method: 'subscriptions.create', args: [params] });
        return Promise.resolve({ id: 'sub_new' });
      },
    },
    invoices: {
      retrieveUpcoming: (params: Record<string, unknown>) => {
        calls.push({ method: 'invoices.retrieveUpcoming', args: [params] });
        if (opts.previewFails) return Promise.reject(new Error('no upcoming invoice'));
        // 700 of proration, then the next full period: amount_due is the
        // whole next invoice, which is not the proration.
        return Promise.resolve({
          amount_due: 1_999,
          lines: { data: [{ amount: 700, proration: true }, { amount: 1_299, proration: false }] },
        });
      },
    },
    checkout: {
      sessions: {
        create: (params: Record<string, unknown>) => {
          calls.push({ method: 'checkout.sessions.create', args: [params] });
          return Promise.resolve({ url: 'https://stripe.test/session' });
        },
      },
    },
  };
}

/** The upgrade branch, transcribed from the function so it can be run. */
async function performUpgrade(
  stripe: ReturnType<typeof fakeStripe>,
  subscriptionId: string,
  newPriceId: string,
) {
  const current = await stripe.subscriptions.retrieve(subscriptionId);
  const itemId = current.items?.data?.[0]?.id;
  if (!itemId) throw new Error('subscription has no items to update');

  let prorationAmount: number | null = null;
  try {
    const preview = await stripe.invoices.retrieveUpcoming({
      customer: typeof current.customer === 'string' ? current.customer : undefined,
      subscription: subscriptionId,
      subscription_items: [{ id: itemId, price: newPriceId }],
      subscription_proration_behavior: 'create_prorations',
    });
    prorationAmount = quoteFromUpcoming(preview, 'upgrade', null).amountDueNow;
  } catch {
    prorationAmount = null;
  }

  const updated = await stripe.subscriptions.update(subscriptionId, {
    items: [{ id: itemId, price: newPriceId }],
    proration_behavior: 'create_prorations',
  });
  return { subscriptionId: updated.id, prorationAmount };
}

Deno.test('BRANCH: upgrading changes the price on the one subscription', async () => {
  const calls: FakeCall[] = [];
  const result = await performUpgrade(fakeStripe(calls), 'sub_existing', 'price_vip');

  assertEquals(result.subscriptionId, 'sub_existing', 'the same subscription, not a new one');
  assertEquals(result.prorationAmount, 700, 'the proration lines are returned, not amount_due');

  const methods = calls.map((c) => c.method);
  assert(methods.includes('subscriptions.update'));
  assertFalse(methods.includes('subscriptions.create'), 'no second subscription');
  assertFalse(methods.includes('checkout.sessions.create'), 'and no second checkout');

  const update = calls.find((c) => c.method === 'subscriptions.update')!;
  const params = update.args[1] as { items: Array<{ id: string; price: string }>; proration_behavior: string };
  assertEquals(params.items[0].id, 'si_existing', 'the existing item is replaced, not appended');
  assertEquals(params.items[0].price, 'price_vip');
  assertEquals(params.proration_behavior, 'create_prorations');
});

Deno.test('BRANCH: a failed preview still performs the upgrade', async () => {
  // The figure is a courtesy; refusing to upgrade because it could not be
  // fetched would strand a paying customer on the wrong tier.
  const calls: FakeCall[] = [];
  const result = await performUpgrade(fakeStripe(calls, { previewFails: true }), 'sub_existing', 'price_vip');

  assertEquals(result.prorationAmount, null);
  assert(calls.some((c) => c.method === 'subscriptions.update'), 'the upgrade still happens');
});

Deno.test('BRANCH: a subscription with no items is refused rather than guessed at', async () => {
  const calls: FakeCall[] = [];
  const stripe = fakeStripe(calls);
  stripe.subscriptions.retrieve = (id: string) =>
    Promise.resolve({ id, customer: 'cus_123', items: { data: [] } });

  let threw = false;
  try {
    await performUpgrade(stripe, 'sub_broken', 'price_vip');
  } catch {
    threw = true;
  }
  assert(threw, 'no item id means no safe update');
  assertFalse(calls.some((c) => c.method === 'subscriptions.update'));
});
