/**
 * The scraper does not rate-limit itself, and every job gets a turn
 * (WEB-BE-047).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/scraper-rate-limit.test.ts
 *
 * WHAT THIS IS PROTECTING. firecrawl-scraper allows 10 requests per 15 minutes
 * keyed by CLIENT IP. scrape-events invokes it once per scraping job from a
 * single egress address, and 15 jobs are seeded. So the scraper spent its own
 * budget on itself and the eleventh job of a run got a 429 - which is exactly
 * the "Edge Function returned a non-2xx status code" that every job_results
 * entry carried on the days when every source failed.
 *
 * The second half is quieter and worse: `.limit(10)` had no ORDER BY, so the
 * same ten rows came back every run and five scraping jobs had never been
 * scraped at all. Nothing anywhere reported that, because the ten that ran
 * reported success.
 *
 * node:assert rather than std/assert deliberately: it needs no network.
 */

import { strict as assert } from 'node:assert';
import {
  classifyCaller,
  isMachineCaller,
  presentedCredentials,
  timingSafeEqual,
  type CallerKind,
} from '../_shared/callerKind.ts';

const API_KEY = 'edge-function-api-key-value';
const SERVICE_ROLE = 'service-role-key-value';
const EXPECTED = { apiKey: API_KEY, serviceRoleKey: SERVICE_ROLE };

const REPO = new URL('../../../', import.meta.url);
const read = async (rel: string) => await Deno.readTextFile(new URL(rel, REPO));
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(?<!:)\/\/.*$/, '')).join('\n');

function req(headers: Record<string, string>): Request {
  return new Request('https://example.com/', { headers });
}

Deno.test('the API key is recognised in either header', () => {
  assert.equal(classifyCaller({ apiKeyHeader: API_KEY }, EXPECTED), 'api_key');
  assert.equal(classifyCaller({ bearer: API_KEY }, EXPECTED), 'api_key');
});

Deno.test('the service-role key is a machine caller too', () => {
  // pg_cron authenticates with it; nothing ships EDGE_FUNCTION_API_KEY into a
  // cron migration.
  assert.equal(classifyCaller({ bearer: SERVICE_ROLE }, EXPECTED), 'service_role');
});

Deno.test('a user JWT and an anonymous request are not machine callers', () => {
  assert.equal(classifyCaller({ bearer: 'eyJhbGciOi.some.jwt' }, EXPECTED), 'bearer');
  assert.equal(classifyCaller({}, EXPECTED), 'anonymous');
  assert.equal(classifyCaller({ apiKeyHeader: 'wrong' }, EXPECTED), 'anonymous');
  for (const kind of ['bearer', 'anonymous'] as CallerKind[]) {
    assert.equal(isMachineCaller(kind), false);
  }
});

Deno.test('an UNSET expected secret never matches', () => {
  // The failure this pins is specific and it is not the obvious one. A
  // timing-safe comparison of '' against '' returns TRUE, so a function
  // deployed without EDGE_FUNCTION_API_KEY would classify a caller presenting
  // an empty header as internal - which is every caller, including anonymous
  // ones. The empty-string guards on both sides of each comparison are what
  // stop it; removing either one makes this test fail.
  assert.equal(classifyCaller({ apiKeyHeader: '' }, { apiKey: '', serviceRoleKey: '' }), 'anonymous');
  assert.equal(classifyCaller({}, { apiKey: '', serviceRoleKey: '' }), 'anonymous');
  assert.equal(classifyCaller({ apiKeyHeader: 'anything' }, {}), 'anonymous');
  assert.equal(classifyCaller({ bearer: '' }, { apiKey: undefined }), 'anonymous');
  // And a caller presenting nothing against a CONFIGURED secret is still out.
  assert.equal(classifyCaller({ apiKeyHeader: '', bearer: '' }, EXPECTED), 'anonymous');
});

Deno.test('a near-miss key is not a machine caller', () => {
  assert.equal(classifyCaller({ apiKeyHeader: API_KEY + 'x' }, EXPECTED), 'anonymous');
  assert.equal(classifyCaller({ apiKeyHeader: API_KEY.slice(0, -1) }, EXPECTED), 'anonymous');
  assert.equal(classifyCaller({ bearer: SERVICE_ROLE.toUpperCase() }, EXPECTED), 'bearer');
});

Deno.test('timingSafeEqual compares every character of equal-length strings', () => {
  assert.ok(timingSafeEqual('abcdef', 'abcdef'));
  assert.ok(!timingSafeEqual('abcdef', 'abcdeg'));
  assert.ok(!timingSafeEqual('abcdef', 'abcde'));
  assert.ok(timingSafeEqual('', ''));
});

Deno.test('credentials are read from both header spellings', () => {
  assert.equal(presentedCredentials(req({ 'X-API-Key': API_KEY })).apiKeyHeader, API_KEY);
  assert.equal(presentedCredentials(req({ 'x-api-key': API_KEY })).apiKeyHeader, API_KEY);
  assert.equal(presentedCredentials(req({ Authorization: `Bearer ${API_KEY}` })).bearer, API_KEY);
  // A non-bearer scheme is not a bearer token.
  assert.equal(presentedCredentials(req({ Authorization: `Basic ${API_KEY}` })).bearer, '');
});

Deno.test('fifteen internal calls in one window are all exempt', () => {
  // The scenario the story is about: scrape-events fans out to 15 jobs from one
  // IP against a limit of 10. Every one of them carries the API key.
  const internal = Array.from({ length: 15 }, () =>
    classifyCaller({ apiKeyHeader: API_KEY }, EXPECTED));
  assert.equal(internal.filter(isMachineCaller).length, 15);
  // And an anonymous caller in the same window is still subject to it.
  assert.equal(isMachineCaller(classifyCaller({}, EXPECTED)), false);
});

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

Deno.test('firecrawl-scraper exempts internal callers from its IP limit', async () => {
  const src = codeOnly(await read('supabase/functions/firecrawl-scraper/index.ts'));
  assert.match(
    src,
    /endpoint:\s*'firecrawl-scraper'[\s\S]{0,200}?exemptInternal:\s*true/,
    'the scraper must exempt internal callers, or it throttles its own orchestrator',
  );
});

Deno.test('the exemption is opt-in, not the default', async () => {
  // An endpoint that costs money per call may want a ceiling even on internal
  // traffic. Defaulting this on would remove that choice everywhere at once.
  const src = codeOnly(await read('supabase/functions/_shared/rateLimit.ts'));
  assert.match(
    src,
    /options\.exemptInternal\s*&&\s*isMachineCaller\(/,
    'the exemption must be gated on the caller passing exemptInternal',
  );
  assert.ok(
    !/exemptInternal\s*=\s*true/.test(src),
    'exemptInternal must not default to true',
  );
});

Deno.test('scrape-events orders its job selection', async () => {
  // Without this, .limit(10) returns whatever Postgres hands back - the same
  // ten rows every run, and five jobs that have never been scraped.
  const src = codeOnly(await read('supabase/functions/scrape-events/index.ts'));
  assert.match(
    src,
    /\.order\("last_run",\s*\{\s*ascending:\s*true,\s*nullsFirst:\s*true\s*\}\)/,
    'job selection must order by last_run with nulls first',
  );
  const orderAt = src.indexOf('.order("last_run"');
  const limitAt = src.indexOf('.limit(10)', orderAt);
  assert.ok(
    orderAt > 0 && limitAt > orderAt,
    'the ORDER BY must be applied before the limit, or the limit picks from an unordered set',
  );
});

Deno.test('apiKeyAuth has one definition of a machine caller, not three', async () => {
  const src = codeOnly(await read('supabase/functions/_shared/apiKeyAuth.ts'));
  assert.match(src, /isMachineCaller\(classifyCaller\(/, 'requireAdminOrApiKey must use the shared classification');
  // The three inline timing-safe comparisons it replaced.
  const comparisons = (src.match(/timingSafeEqual\(/g) || []).length;
  assert.ok(
    comparisons <= 2,
    `apiKeyAuth still makes ${comparisons} timing-safe comparisons of its own; the classification belongs in callerKind.ts`,
  );
});
