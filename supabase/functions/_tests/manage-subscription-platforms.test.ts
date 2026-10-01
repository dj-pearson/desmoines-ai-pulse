/**
 * manage-subscription platform routing (WEB-FEAT-015).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/manage-subscription-platforms.test.ts
 *
 * Three subscribers, one query, and it was wrong for two of them:
 *
 *   web-only    fine, by accident -- one row, so .single() matched.
 *   dual        web row + iOS row matched TWO rows, .single() returned PGRST116
 *               with data null, and every branch read that as "no subscription".
 *               The users it broke were the ones paying us twice.
 *   store-only  one row, matched, but it carries no stripe_customer_id, so
 *               "portal" and "cancel" answered "No active subscription found"
 *               to someone with an active subscription.
 *
 * The decision logic is asserted as behaviour against the same rows the
 * function reads; the source-text tests pin the two queries that produce them,
 * because the routing is only as good as the rows fed to it.
 */

import { strict as nodeAssert } from 'node:assert';
import { manageAtForPlatform, STORE_MANAGE_URLS, getSiteUrl } from '../_shared/siteUrl.ts';

// node:assert rather than deno.land/std, so this runs offline.
const assert = (condition: unknown, message = '') => nodeAssert.ok(condition, message);
const assertFalse = (condition: unknown, message = '') => nodeAssert.ok(!condition, message);
const assertEquals = <T>(actual: T, expected: T, message = '') =>
  nodeAssert.deepStrictEqual(actual, expected, message);

const REPO = new URL('../../../', import.meta.url);
const FN = 'supabase/functions/manage-subscription/index.ts';
const src = await Deno.readTextFile(new URL(FN, REPO));

Deno.test('a web row is managed here, not at a store', () => {
  assertEquals(manageAtForPlatform('web'), null);
  assertEquals(manageAtForPlatform(null), null);
  assertEquals(manageAtForPlatform(undefined), null);
});

Deno.test('an iOS row routes to the App Store and an Android row to Google Play', () => {
  assertEquals(manageAtForPlatform('ios'), 'appstore');
  assertEquals(manageAtForPlatform('android'), 'play');
  assertEquals(STORE_MANAGE_URLS.appstore, 'https://apps.apple.com/account/subscriptions');
  assertEquals(STORE_MANAGE_URLS.play, 'https://play.google.com/store/account/subscriptions');
});

Deno.test('the web lookup is scoped to one platform and tolerates no row', () => {
  assert(
    /\.eq\("platform", "web"\)\s*\n\s*\.in\("status", SUBSCRIPTION_STATUSES\)\s*\n\s*\.maybeSingle\(\);/
      .test(src),
    'the web read must filter by platform and use maybeSingle',
  );
  // The defect itself: .single() over every platform.
  assertFalse(
    /\.eq\("user_id", user\.id\)\s*\n\s*\.in\("status", \[[^\]]*\]\)\s*\n\s*\.single\(\);/.test(src),
    'no unfiltered .single() may remain -- it nulls the row for dual-platform users',
  );
});

Deno.test('store rows are read separately, both platforms, same statuses', () => {
  assert(
    /\.in\("platform", \["ios", "android"\]\)\s*\n\s*\.in\("status", SUBSCRIPTION_STATUSES\);/.test(src),
    'store rows must be read with the same status window as the web row',
  );
});

Deno.test('either failed read refuses rather than reporting "no subscription"', () => {
  assert(/if \(subError \|\| storeSubError\) \{/.test(src), 'both errors must be branched on');
  assert(/status: 503,/.test(src));
  // PGRST116 was .single()'s empty-row code. maybeSingle does not raise it, so
  // a surviving special-case would be dead code swallowing a real error. The
  // history stays in the comments; what must be gone is the branch.
  assertFalse(
    /code !== "PGRST116"/.test(src),
    'the PGRST116 special-case belongs to .single() and has no meaning under maybeSingle',
  );
});

Deno.test('portal, cancel and resume all route a store subscriber instead of denying them', () => {
  const routed = src.match(/if \(manageAt\) return storeManagedResponse\(\);/g) ?? [];
  assertEquals(routed.length, 3, 'portal, cancel and resume each need the branch');
});

Deno.test('the store answer is a 200 carrying the deep link', () => {
  const block = src.slice(src.indexOf('const storeManagedResponse'));
  assert(/managedExternally: true/.test(block));
  assert(/manageUrl: manageAt \? STORE_MANAGE_URLS\[manageAt\] : null/.test(block));
  assert(/status: 200,/.test(block), 'invoke() drops the body of a non-2xx, taking the link with it');
});

Deno.test('details counts store rows, so a store subscriber is not reported as free', () => {
  assert(/const allRows = \[/.test(src));
  assert(/\.\.\.storeRows,/.test(src));
  assert(/tier: planOf\(highest\)\?\.name \|\| "free"/.test(src), 'tier is the highest row held anywhere');
  assertFalse(
    /tier: subscription\.plan\?\.name \|\| "free"/.test(src),
    'reading tier off the web row alone is what reported store subscribers as free',
  );
});

Deno.test('the return-URL fallback comes from one shared resolver, not a literal', () => {
  assert(/const siteUrl = getSiteUrl\(\);/.test(src));
  assertFalse(
    /Deno\.env\.get\("SITE_URL"\)/.test(src),
    'the env chain belongs in _shared/siteUrl.ts, not inlined per call site',
  );
  assertFalse(/https:\/\/desmoines\w*\.com/.test(src), 'no hardcoded domain in this function');
});

Deno.test('getSiteUrl prefers the configured value and never keeps a trailing slash', () => {
  const previous = Deno.env.get('SITE_URL');
  try {
    Deno.env.set('SITE_URL', 'https://example.test/');
    assertEquals(getSiteUrl(), 'https://example.test');
  } finally {
    if (previous === undefined) Deno.env.delete('SITE_URL');
    else Deno.env.set('SITE_URL', previous);
  }
});

/* ------------------------------------------------------------------------- *
 * Pricing plan WP5 item 8: limits, actions, state, invoices.
 * ------------------------------------------------------------------------- */

const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*$/gm, '');

Deno.test('a missing action is details, an unknown one is a 400', () => {
  assert(/const requestedAction = body\?\.action \?\? "details";/.test(code), 'old bundles that omit action get details');
  assert(/if \(!ACTIONS\.includes\(requestedAction\)\) \{/.test(code));
  assert(/code: "unknown_action"/.test(code));
  assertFalse(/case "details":\s*\n\s*default:/.test(code), 'details must no longer be the catch-all');
});

Deno.test('every action is rate limited per user, reads looser than writes', () => {
  assert(/checkRateLimitPersistent\(req, \{/.test(code));
  assert(/userId: user\.id,/.test(code));
  const read = code.match(/read: \{ max: (\d+)/);
  const write = code.match(/write: \{ max: (\d+)/);
  assert(read && write && Number(read[1]) > Number(write[1]), 'details and invoices get the looser limit');
  assert(/addCorsHeaders\(limit\.response, allowedOrigin\)/.test(code), 'the 429 carries CORS headers');
  // The limit runs after auth, so it can be keyed on a verified user id.
  assert(code.indexOf('checkRateLimitPersistent(req') > code.indexOf('supabase.auth.getUser(token)'));
});

Deno.test('cancel and resume return Stripe\'s state and check the local write', () => {
  assert(/const canceled = await stripe\.subscriptions\.update\(/.test(code));
  assert(/const resumed = await stripe\.subscriptions\.update\(/.test(code));
  assert(/cancelAtPeriodEnd: canceled\.cancel_at_period_end/.test(code));
  assert(/cancelAtPeriodEnd: resumed\.cancel_at_period_end/.test(code));
  assert(/if \(cancelWriteError\) \{/.test(code) && /if \(resumeWriteError\) \{/.test(code));
  // cancel_at stays for bundles that read it.
  assert(/cancel_at: canceledPeriodEnd/.test(code));
});

Deno.test('the dead payments read is gone and the key stays for compatibility', () => {
  assertFalse(/\.from\("payments"\)/.test(code), 'payments is not in production');
  assert(/payments: \[\],/.test(code));
});

Deno.test('invoices come from Stripe, capped at 12, with Stripe\'s own links', () => {
  assert(/case "invoices": \{/.test(code));
  assert(/stripe\.invoices\.list\(\{\s*\n\s*customer: customerRow\.stripe_customer_id as string,\s*\n\s*limit: 12,/.test(code));
  for (const field of ['number:', 'created:', 'status:', 'amountPaid:', 'currency:', 'hostedInvoiceUrl:', 'invoicePdf:']) {
    assert(code.includes(field), `invoice field ${field}`);
  }
});
