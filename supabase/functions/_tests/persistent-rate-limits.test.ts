/**
 * Mail and money endpoints use the persistent rate limiter.
 *
 * checkRateLimit counts in the isolate's memory, so a burst spread across cold
 * starts and instances never reaches the limit. For newsletter-subscribe (sends
 * mail, no caller to authenticate), create-campaign-checkout (creates Stripe
 * sessions) and process-stripe-refund (moves money) that is the whole defence.
 * Limits are unchanged: tightening them is a compat break (CLAUDE.md).
 */

import { assert } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*$/gm, '');

const ENDPOINTS: Array<[string, number]> = [
  ['newsletter-subscribe', 5],
  ['create-campaign-checkout', 10],
  ['process-stripe-refund', 5],
];

for (const [name, max] of ENDPOINTS) {
  Deno.test(`${name} is limited persistently at max ${max}`, async () => {
    const src = code(await read(`supabase/functions/${name}/index.ts`));
    assert(!/\bcheckRateLimit\(/.test(src), `${name} still calls the in-memory limiter`);
    const call = src.match(/await checkRateLimitPersistent\(req, \{([\s\S]*?)\}\);/);
    assert(call, `${name} must await checkRateLimitPersistent`);
    assert(new RegExp(`endpoint: "${name}"`).test(call[1]), 'its own endpoint key, not the shared "default" bucket');
    assert(new RegExp(`max: ${max},`).test(call[1]), `the limit stays ${max}`);
  });
}

Deno.test('the persistent 429 carries the caller message', async () => {
  const src = code(await read('supabase/functions/_shared/rateLimit.ts'));
  assert(/checkRateLimitDB\(clientId, endpoint, windowMs, max, message\)/.test(src));
  assert(!/'Too many requests, please try again later\.',\s*retryAfter/.test(src));
});

Deno.test('rate_limit_entries is cleaned on a schedule', async () => {
  const sql = await read('supabase/migrations/20261015000007_schedule_rate_limit_cleanup.sql');
  assert(/cron\.schedule\(\s*'rate-limit-cleanup'/.test(sql));
  assert(/DELETE FROM public\.rate_limit_entries WHERE created_at < now\(\) - interval '1 day'/.test(sql));
  assert(!/net\.http_post/.test(sql), 'plain SQL, no HTTP hop');
});
