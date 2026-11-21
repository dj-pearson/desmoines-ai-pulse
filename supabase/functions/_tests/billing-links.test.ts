/**
 * Every billing email links where billing is (WEB-LEGAL-016).
 *
 * Run with:
 *   deno test --allow-read --allow-env supabase/functions/_tests/billing-links.test.ts
 *
 * The trial notice ("Cancel before you are charged"), the dunning reminder
 * ("Update payment method") and the upgrade prompt ("See Insider") all linked
 * to /profile?tab=settings, which shows security and email settings and no
 * plan, card or cancel control. trial-notice.test.ts pinned that URL as
 * correct, so the test meant to catch it guarded it instead.
 *
 * This file renders every billing email, pulls out every link, and requires
 * each one to resolve to a path in _shared/billingLinks.ts (or a store's own
 * subscriptions page). It then checks those paths against the router: a
 * shared constant that names a route App.tsx does not have would move every
 * email to a 404 at once.
 */

import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  buildDunningEmail,
  buildUpgradePromptEmail,
  LEGACY_BILLING_PATHS,
  PRICING_PATH,
  pricingUrl,
  SUBSCRIPTION_PATH,
  subscriptionUrl,
} from '../_shared/billingLinks.ts';
import { buildTrialNotice } from '../_shared/trialNotice.ts';
import { type BillingEmailDeps, sendSubscriptionCancelled, sendSubscriptionStarted } from '../_shared/billingEmails.ts';
import type { SendEmailInput } from '../_shared/email.ts';
import { type LifecycleAction, lifecycleEmail, manageUrlFor } from '../subscription-lifecycle/policy.ts';
import { STORE_MANAGE_URLS } from '../_shared/siteUrl.ts';

const SITE = 'https://example.com';
const read = (rel: string) => Deno.readTextFile(new URL(rel, import.meta.url));

/** Every href in the HTML and every site URL in the text. */
function links(html: string, text: string): string[] {
  const out: string[] = [];
  // mailto: (the transactional footer's contact address) is not a page.
  for (const m of html.matchAll(/href="(https?:[^"]+)"/g)) out.push(m[1].replace(/&amp;/g, '&'));
  for (const m of text.matchAll(/https?:\/\/[^\s)]+/g)) out.push(m[0]);
  return out;
}

const STORE_URLS: string[] = Object.values(STORE_MANAGE_URLS);

/** A link is a billing destination when its path is one of the shared paths. */
function assertBillingDestination(url: string, where: string) {
  if (STORE_URLS.includes(url)) return;
  const parsed = new URL(url);
  assertEquals(parsed.origin, SITE, `${where}: ${url} leaves the site`);
  assert(
    parsed.pathname === SUBSCRIPTION_PATH || parsed.pathname === PRICING_PATH,
    `${where}: ${url} is not ${SUBSCRIPTION_PATH} or ${PRICING_PATH}`,
  );
  for (const legacy of LEGACY_BILLING_PATHS) {
    assert(!url.includes(legacy), `${where}: links ${legacy}, which has no billing on it`);
  }
}

interface Rendered {
  name: string;
  html: string;
  text: string;
  /** The page this email exists to send the reader to. */
  expects: string;
}

async function renderAll(): Promise<Rendered[]> {
  const out: Rendered[] = [];

  for (const amount of [7.99, null]) {
    const n = buildTrialNotice({
      planName: 'Insider',
      amount,
      interval: amount === null ? null : 'month',
      chargeAt: '2026-09-01T12:00:00.000Z',
      siteUrl: SITE,
    });
    out.push({ name: `trial notice (amount ${amount})`, html: n.html, text: n.text, expects: subscriptionUrl(SITE) });
  }

  const dun = buildDunningEmail(SITE);
  out.push({ name: 'dunning', html: dun.html, text: dun.text, expects: subscriptionUrl(SITE) });

  const up = buildUpgradePromptEmail(SITE);
  out.push({ name: 'upgrade prompt', html: up.html, text: up.text, expects: pricingUrl(SITE, 'insider') });

  const sent: SendEmailInput[] = [];
  const deps: BillingEmailDeps = {
    emailForUser: () => Promise.resolve('member@example.com'),
    planName: () => Promise.resolve('Insider'),
    send: (input) => {
      sent.push(input);
      return Promise.resolve({ ok: true, messageId: 'm1' });
    },
    // A trailing slash, the shape that used to produce "//subscription".
    siteUrl: `${SITE}/`,
    adminAddress: 'ops@example.com',
  };
  await sendSubscriptionStarted(deps, { userId: 'u1', planId: 'p1', trialEnd: 1_800_000_000 });
  await sendSubscriptionCancelled(deps, { userId: 'u1', planId: 'p1', accessUntil: 4_000_000_000 });
  // These are the fully rendered emails, layout included. The transactional
  // layout carries no unsubscribe or preferences link, so every link left is
  // the body's.
  out.push({ name: 'subscription started', html: sent[0].html!, text: sent[0].text!, expects: subscriptionUrl(SITE) });
  out.push({ name: 'subscription cancelled', html: sent[1].html!, text: sent[1].text!, expects: pricingUrl(SITE) });

  const actions: LifecycleAction[] = [
    { kind: 'renewal_reminder', periodEnd: Date.parse('2026-12-01T00:00:00Z') },
    { kind: 'payment_failed', accessUntil: Date.parse('2026-12-08T00:00:00Z') },
    { kind: 'cancel_in_stripe', stripeSubscriptionId: 'sub_1' },
    { kind: 'expire_locally' },
    { kind: 'winback', canceledAt: Date.parse('2026-11-01T00:00:00Z') },
  ];
  for (const platform of ['web', 'ios', 'android']) {
    const manageUrl = manageUrlFor(platform, SITE);
    for (const action of actions) {
      const e = lifecycleEmail(action, { planName: 'Insider', manageUrl, siteUrl: SITE });
      if (!e) continue;
      out.push({ name: `lifecycle ${action.kind} (${platform})`, html: e.html, text: e.text, expects: '' });
    }
  }
  return out;
}

Deno.test('every billing email links only to the shared billing destinations', async () => {
  const all = await renderAll();
  assert(all.length >= 10, `expected every billing email to render, got ${all.length}`);
  for (const email of all) {
    const found = links(email.html, email.text);
    assert(found.length > 0, `${email.name}: has no link at all`);
    for (const url of found) assertBillingDestination(url, email.name);
    if (email.expects) {
      assert(found.includes(email.expects), `${email.name}: should link ${email.expects}, links ${found.join(', ')}`);
    }
  }
});

Deno.test('the trial notice cancel button and the dunning link go to /subscription', () => {
  const n = buildTrialNotice({
    planName: 'Insider', amount: 7.99, interval: 'month', chargeAt: '2026-09-01T12:00:00.000Z', siteUrl: SITE,
  });
  const button = n.html.match(/<a href="([^"]+)"[^>]*>\s*Cancel before you are charged/);
  assertEquals(button?.[1], `${SITE}/subscription`);
  assert(n.text.includes(`${SITE}/subscription`));
  assert(n.text.includes('Google Play'), 'Android subscribers are told where to cancel too');

  const dun = buildDunningEmail(SITE);
  assertEquals(dun.html.match(/<a href="([^"]+)">Update payment method/)?.[1], `${SITE}/subscription`);
  const up = buildUpgradePromptEmail(SITE);
  assertEquals(up.html.match(/<a href="([^"]+)">See Insider/)?.[1], `${SITE}/pricing?plan=insider`);
});

// The checker must still fire. Without this, a links() that matched nothing
// or an assertBillingDestination that accepted everything would pass above.
Deno.test('negative control: the old link and an unknown path are rejected', () => {
  let threw = 0;
  for (const bad of [`${SITE}/profile?tab=settings`, `${SITE}/account`, 'https://elsewhere.test/subscription']) {
    try {
      assertBillingDestination(bad, 'control');
    } catch {
      threw++;
    }
  }
  assertEquals(threw, 3);
  assertEquals(links('<a href="https://example.com/x">x</a>', 'see https://example.com/y'), [
    'https://example.com/x',
    'https://example.com/y',
  ]);
});

Deno.test('the shared destinations are real routes in App.tsx', async () => {
  const app = await read('../../../src/App.tsx');
  for (const path of [SUBSCRIPTION_PATH, PRICING_PATH, '/profile']) {
    assert(app.includes(`<Route path="${path}" `), `App.tsx has no route for ${path}`);
  }
  // Counter-assertion: the check does not pass for a path that is not routed.
  assert(!app.includes('<Route path="/subscription-billing-nowhere" '));
});

Deno.test('the web app and the edge functions name the same paths', async () => {
  const web = await read('../../../src/lib/billingLinks.ts');
  assert(web.includes(`export const SUBSCRIPTION_PATH = "${SUBSCRIPTION_PATH}";`), 'src/lib/billingLinks.ts SUBSCRIPTION_PATH differs');
  assert(web.includes(`export const PRICING_PATH = "${PRICING_PATH}";`), 'src/lib/billingLinks.ts PRICING_PATH differs');
});

Deno.test('the old billing link still shows the subscription', async () => {
  // Mail already sent links /profile?tab=settings. That tab must keep a way
  // to the subscription page, since the emails cannot be recalled.
  const profile = await read('../../../src/pages/Profile.tsx');
  const settings = profile.slice(profile.indexOf('function SettingsTab('), profile.indexOf('export default function Profile('));
  assert(settings.includes('<SubscriptionLinkCard />'), 'the Settings tab must render the subscription card');
  const card = await read('../../../src/components/account/SubscriptionLinkCard.tsx');
  assert(card.includes('to={SUBSCRIPTION_PATH}'));
});

// No billing sender may build its own site link again. Comments may mention
// the old URL to explain the history; code may not.
const BILLING_SOURCES = [
  '../_shared/trialNotice.ts',
  '../_shared/billingEmails.ts',
  '../_shared/agents/subscription-nurture.ts',
  '../agent-subscription-nurture/index.ts',
  '../subscription-lifecycle/policy.ts',
  '../manage-subscription/index.ts',
];

for (const path of BILLING_SOURCES) {
  Deno.test(`builds no billing link of its own (${path})`, async () => {
    const code = (await read(path)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*$/gm, '');
    assert(!code.includes('profile?tab='), 'links the settings tab, which has no billing on it');
    assert(!/\}\/subscription[`"'?#]/.test(code), 'hand-built /subscription link; use subscriptionUrl()');
    assert(!/\}\/pricing[`"'?#]/.test(code), 'hand-built /pricing link; use pricingUrl()');
  });
}
