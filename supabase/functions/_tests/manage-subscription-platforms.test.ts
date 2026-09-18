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

import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { manageAtForPlatform, STORE_MANAGE_URLS, getSiteUrl } from '../_shared/siteUrl.ts';

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
