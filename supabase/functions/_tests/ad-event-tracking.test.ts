/**
 * Ad event tracking (WEB-ADS-002).
 *
 * Impressions and clicks were INSERTed from the browser into ad_impressions and
 * ad_clicks. Neither table has an INSERT policy in any migration, so RLS refused
 * every write and every advertiser dashboard read zero for the life of the
 * feature. The client's frequency cap SELECTed the same tables and failed the
 * same way, so it capped nothing while looking like a control -- which is why
 * the real cap inside get_active_ads was left switched off, with useActiveAds
 * passing p_session_id: null.
 *
 * The bot filter and the idempotency key are unit-tested; the rest is pinned at
 * the source level, because what must not come back is a code path.
 */

import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { looksAutomated, UUID_RE } from '../_shared/adEventFilters.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));

const FN = 'supabase/functions/track-ad-event/index.ts';

Deno.test('crawlers are not billed as reach', () => {
  for (const ua of [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0)',
    'HeadlessChrome/120.0.0.0',
    'Mozilla/5.0 ... Chrome/120 Safari/537.36 Playwright/1.40',
    'curl/8.4.0',
    'python-requests/2.31.0',
    'facebookexternalhit/1.1',
  ]) {
    assert(looksAutomated(ua), `should be filtered: ${ua}`);
  }
});

Deno.test('a missing User-Agent counts as automated', () => {
  // Every real browser sends one, and sending nothing is the cheapest way to
  // dodge a substring match.
  assert(looksAutomated(null));
  assert(looksAutomated(undefined));
  assert(looksAutomated(''));
});

Deno.test('real browsers are still counted', () => {
  for (const ua of [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  ]) {
    assertFalse(looksAutomated(ua), `should be counted: ${ua}`);
  }
});

Deno.test('the idempotency key is a uuid or it is replaced', async () => {
  assert(UUID_RE.test(crypto.randomUUID()));
  assertFalse(UUID_RE.test('not-a-uuid'));
  assertFalse(UUID_RE.test(''));

  const src = await read(FN);
  assert(
    /const eventId = UUID_RE\.test\(String\(clientEventId \?\? ''\)\) \? clientEventId : crypto\.randomUUID\(\);/.test(src),
    'a bad client_event_id must be replaced, never written through',
  );
  // Both writes must conflict on it, or a retry bills twice.
  const conflicts = src.match(/onConflict: 'client_event_id', ignoreDuplicates: true/g) ?? [];
  assertEquals(conflicts.length, 2, 'impressions AND clicks must be idempotent');
});

Deno.test('nothing is recorded against a campaign nobody is paying for', async () => {
  const src = await read(FN);
  assert(
    /\.eq\('id', creativeId\)\s*\n\s*\.eq\('campaign_id', campaignId\)/.test(src),
    'the creative must belong to the campaign it claims',
  );
  assert(
    /creative\.is_approved !== true \|\| campaignStatus !== 'active'/.test(src),
    'only an approved creative on an active campaign is billable',
  );
  // A refusal must look like an acceptance from outside.
  assert(
    /return json\(\{ recorded: false, reason: 'not_billable' \}\)/.test(src),
    'refusals answer 200 so a caller cannot probe the rules',
  );
  assertFalse(/reason: 'not_billable' \}, 4\d\d\)/.test(src));
});

Deno.test('the browser no longer writes the tables directly', async () => {
  const tracking = await read('src/lib/tracking.ts');

  // The writes must go through the function...
  const invokes = tracking.match(/supabase\.functions\.invoke\('track-ad-event'/g) ?? [];
  assertEquals(invokes.length, 2, 'one for the impression, one for the click');

  // ...and the inserts must be gone. Reads stay: getCampaignAnalytics still
  // SELECTs, which is what migration 20260902000009 grants.
  assertFalse(
    /from\('ad_impressions'\)\s*\n?\s*\.insert\(/.test(tracking),
    'no direct impression insert may remain',
  );
  assertFalse(
    /from\('ad_clicks'\)\s*\n?\s*\.insert\(/.test(tracking),
    'no direct click insert may remain',
  );
});

Deno.test('the frequency cap that never capped is deleted, and the real one is switched on', async () => {
  const tracking = await read('src/lib/tracking.ts');
  assertFalse(
    /export async function shouldShowAd\(/.test(tracking),
    'the client-side cap must be gone, not merely unused',
  );

  const hook = await read('src/hooks/useAdTracking.ts');
  assertFalse(/shouldShowAd\(/.test(hook), 'and nothing may still call it');

  // The server cap only runs when it is given a session to key on.
  const ads = await read('src/hooks/useActiveAds.ts');
  assert(
    /p_session_id: getOrCreateSessionId\(\)/.test(ads),
    'get_active_ads needs the session id or its cap is skipped',
  );
  assert(/p_user_id: authData\?\.user\?\.id \?\? null/.test(ads), 'and the user id for the daily cap');
  assertFalse(/p_session_id: null/.test(ads), 'the null that disabled the cap must be gone');
});

Deno.test('an advertiser can read their own numbers, and only their own', async () => {
  const sql = await read('supabase/migrations/20260902000009_ad_analytics_read_access.sql');
  for (const table of ['ad_impressions', 'ad_clicks']) {
    assert(
      new RegExp(`CREATE POLICY "${table}_owner_or_admin_select"`).test(sql),
      `${table} needs a read policy or the dashboard stays empty`,
    );
  }
  assert(/c\.user_id = auth\.uid\(\)/.test(sql), 'scoped to the campaign owner');
  assert(/public\.is_admin\(\)/.test(sql), 'and admins');
  assertFalse(/TO anon/.test(sql), 'impressions carry session ids and page urls; not public');
  // Enabling RLS on a table where it may be off would deny access that works.
  assertFalse(/ENABLE ROW LEVEL SECURITY/.test(sql));
});
