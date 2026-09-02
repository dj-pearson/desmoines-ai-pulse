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
 */

import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const FN = 'supabase/functions/create-subscription-checkout/index.ts';
const src = await Deno.readTextFile(new URL(FN, REPO));

Deno.test('the guard query is scoped to one platform, so it can return one row', () => {
  assert(
    /\.eq\("platform", "web"\)\s*\n\s*\.in\("status", \["active", "trialing"\]\)\s*\n\s*\.maybeSingle\(\);/.test(src),
    'the web lookup must filter by platform and use maybeSingle',
  );
  // .single() on a query that can match several rows is the defect itself.
  assertFalse(
    /\.in\("status", \["active", "trialing"\]\)\s*\n\s*\.single\(\);/.test(src),
    'no unfiltered .single() may remain: it nulls the row and disables every guard',
  );
});

Deno.test('a store subscription at the same or a higher tier blocks a web purchase', () => {
  assert(/\.in\("platform", \["ios", "android"\]\)/.test(src), 'store rows must be looked up');
  assert(/rank >= requestedRank/.test(src), 'same tier counts, not just higher');
  assert(/code: "store_subscription_active"/.test(src));
  assert(/status: 409/.test(src));
  // The message has to send them where the billing actually lives.
  assert(/the App Store/.test(src) && /Google Play/.test(src), 'name the store they bought from');
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
        return Promise.resolve({ amount_due: 700 });
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
    prorationAmount = typeof preview.amount_due === 'number' ? preview.amount_due : null;
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
  assertEquals(result.prorationAmount, 700, 'the previewed amount is returned');

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
