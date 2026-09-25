/**
 * One dunning clock, owned by Stripe (pricing plan WP5 items 3 and 7).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/subscription-lifecycle-policy.test.ts
 *
 * The job cancelled a past_due row locally at period end + 7 days while the
 * paywall granted 14, and never told Stripe, so Stripe kept retrying the old
 * subscription and a member who resubscribed was billed twice. These pin the
 * new rules: the paywall's own grace window, a Stripe cancel at the end of it,
 * and no local cancel of anything a store bills.
 *
 * node:assert and no remote import: runs offline.
 */

import { strict as assert } from 'node:assert';
import {
  GRACE_PERIOD_DAYS,
  graceEndsAt,
  isWebBilled,
  lifecycleActions,
  lifecycleEmail,
  manageUrlFor,
  marketingAllowedFrom,
  planLabel,
  type LifecycleRow,
} from '../subscription-lifecycle/policy.ts';
import { GRACE_PERIOD_DAYS as ENTITLEMENT_GRACE, isSubscriptionRowEntitled } from '../_shared/entitlements.ts';

const DAY = 24 * 60 * 60 * 1000;
const PERIOD_END = Date.parse('2026-09-01T12:00:00Z');
const SITE = 'https://example.test';

function row(overrides: Partial<LifecycleRow> = {}): LifecycleRow {
  return {
    id: 'row-1',
    user_id: 'user-1',
    status: 'past_due',
    platform: 'web',
    current_period_end: new Date(PERIOD_END).toISOString(),
    canceled_at: null,
    cancel_at_period_end: false,
    stripe_subscription_id: 'sub_123',
    ...overrides,
  };
}

const kinds = (r: LifecycleRow, now: number, marketingAllowed = true) =>
  lifecycleActions(r, now, { marketingAllowed }).map((a) => a.kind);

Deno.test('the grace window is the paywall constant, not a second one', () => {
  assert.equal(GRACE_PERIOD_DAYS, ENTITLEMENT_GRACE);
  assert.equal(GRACE_PERIOD_DAYS, 14);
});

Deno.test('day 8 past period end keeps access and only nudges', () => {
  const now = PERIOD_END + 8 * DAY;
  assert.deepEqual(kinds(row(), now), ['payment_failed']);
  // The old job cancelled here (7 days). The paywall still says entitled.
  assert.equal(isSubscriptionRowEntitled('past_due', row().current_period_end, new Date(now)), true);
});

Deno.test('day 15 past period end cancels the subscription in Stripe', () => {
  const actions = lifecycleActions(row(), PERIOD_END + 15 * DAY, { marketingAllowed: true });
  assert.deepEqual(actions, [{ kind: 'cancel_in_stripe', stripeSubscriptionId: 'sub_123' }]);
  assert.equal(isSubscriptionRowEntitled('past_due', row().current_period_end, new Date(PERIOD_END + 15 * DAY)), false);
});

Deno.test('a store row is never cancelled, nudged or mailed here', () => {
  for (const platform of ['ios', 'android']) {
    for (const days of [8, 15, 400]) {
      assert.deepEqual(kinds(row({ platform }), PERIOD_END + days * DAY), [], `${platform} day ${days}`);
    }
    assert.equal(isWebBilled(platform), false);
  }
});

Deno.test('a legacy row with no platform is web-billed', () => {
  assert.equal(isWebBilled(null), true);
  assert.deepEqual(kinds(row({ platform: null }), PERIOD_END + 15 * DAY), ['cancel_in_stripe']);
});

Deno.test('a web row with no Stripe subscription is expired locally, since nothing else will', () => {
  assert.deepEqual(kinds(row({ stripe_subscription_id: null }), PERIOD_END + 15 * DAY), ['expire_locally']);
});

Deno.test('past_due with no period end keeps nudging and is never cancelled', () => {
  assert.deepEqual(kinds(row({ current_period_end: null }), PERIOD_END + 400 * DAY), ['payment_failed']);
});

Deno.test('the payment-failed email states the access date from the same clock', () => {
  const [action] = lifecycleActions(row(), PERIOD_END + 8 * DAY, { marketingAllowed: true });
  assert.equal(action.kind, 'payment_failed');
  assert.equal(action.kind === 'payment_failed' && action.accessUntil, PERIOD_END + 14 * DAY);
  assert.equal(graceEndsAt(null), null);
});

Deno.test('renewal reminder: active, auto-renewing, within 7 days', () => {
  const active = row({ status: 'active' });
  assert.deepEqual(kinds(active, PERIOD_END - 3 * DAY), ['renewal_reminder']);
  assert.deepEqual(kinds(active, PERIOD_END - 10 * DAY), []);
  assert.deepEqual(kinds({ ...active, cancel_at_period_end: true }, PERIOD_END - 3 * DAY), []);
});

Deno.test('win-back goes only to members who have not opted out of marketing', () => {
  const canceled = row({ status: 'canceled', canceled_at: new Date(PERIOD_END).toISOString() });
  assert.deepEqual(kinds(canceled, PERIOD_END + 2 * DAY, true), ['winback']);
  assert.deepEqual(kinds(canceled, PERIOD_END + 2 * DAY, false), []);
  assert.deepEqual(kinds(canceled, PERIOD_END + 5 * DAY, true), [], 'outside the window');
});

Deno.test('an unreadable profile is not consent', () => {
  assert.equal(marketingAllowedFrom({ messagingAllowed: true }, false), false);
  assert.equal(marketingAllowedFrom({ messagingAllowed: false }, true), false);
  assert.equal(marketingAllowedFrom({}, true), true);
  assert.equal(marketingAllowedFrom(null, true), true);
});

Deno.test('emails name the member\'s own plan and link where it is managed', () => {
  const vip = planLabel({ name: 'vip', display_name: 'VIP' });
  assert.equal(vip, 'VIP');
  assert.equal(planLabel({ name: 'insider', display_name: null }), 'Insider');

  const webLink = manageUrlFor('web', SITE);
  assert.equal(webLink, `${SITE}/subscription`);
  assert.equal(manageUrlFor(null, SITE), `${SITE}/subscription`);
  assert.equal(manageUrlFor('ios', SITE), 'https://apps.apple.com/account/subscriptions');
  assert.equal(manageUrlFor('android', SITE), 'https://play.google.com/store/account/subscriptions');

  const ctx = { planName: vip, manageUrl: webLink, siteUrl: SITE };
  for (const action of lifecycleActions(row(), PERIOD_END + 8 * DAY, { marketingAllowed: true })) {
    const email = lifecycleEmail(action, ctx)!;
    assert.ok(email.text.includes('VIP'), 'a VIP is not told about Insider');
    assert.ok(!/Insider perks/.test(email.html));
    assert.ok(email.html.includes(`${SITE}/subscription`));
    assert.ok(!email.html.includes('/profile?tab=settings'), 'billing emails do not link to a page with no billing on it');
    assert.equal(email.category, 'transactional');
  }

  const ended = lifecycleEmail({ kind: 'cancel_in_stripe', stripeSubscriptionId: 'sub_123' }, ctx)!;
  assert.ok(ended.subject.includes('VIP'));
  assert.equal(ended.category, 'transactional');

  const winback = lifecycleEmail({ kind: 'winback', canceledAt: PERIOD_END }, ctx)!;
  assert.equal(winback.category, 'marketing');
});

Deno.test('a plan name is escaped in the HTML', () => {
  const email = lifecycleEmail({ kind: 'renewal_reminder', periodEnd: PERIOD_END }, {
    planName: '<b>VIP</b>',
    manageUrl: `${SITE}/subscription`,
    siteUrl: SITE,
  })!;
  assert.ok(!email.html.includes('<b>VIP</b>'));
});

/* ------------------------------------------------------------------------- *
 * index.ts wiring, as source text: it imports Stripe from esm.sh.
 * ------------------------------------------------------------------------- */

const src = await Deno.readTextFile(new URL('../subscription-lifecycle/index.ts', import.meta.url));
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*$/gm, '');

Deno.test('index.ts takes its decisions from policy.ts and keeps no clock of its own', () => {
  assert.ok(/from '\.\/policy\.ts'/.test(code));
  assert.ok(/lifecycleActions\(sub, now, \{ marketingAllowed \}\)/.test(code));
  assert.equal(/GRACE_DAYS\s*=/.test(code), false, 'a second grace constant is back');
});

Deno.test('dunning ends with a Stripe cancel, and the row is left to the webhook', () => {
  assert.ok(/stripe\.subscriptions\.cancel\(/.test(code));
  // The only local status write is the no-Stripe-id expiry, scoped to past_due.
  const writes = code.match(/\.update\(\{ status: 'canceled'/g) ?? [];
  assert.equal(writes.length, 1);
  assert.ok(/\.eq\('status', 'past_due'\)/.test(code));
});

Deno.test('nothing is logged as sent unless it was', () => {
  assert.ok(/if \(!\(await send\(\)\)\) break;/.test(code));
  assert.ok(/const \{ error \} = await supabase\.from\('subscription_events'\)\.insert/.test(code));
});
