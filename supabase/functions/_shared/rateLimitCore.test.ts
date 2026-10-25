/**
 * A rate-limited response has to reach the page that asked.
 *
 * Run with:
 *   deno test --allow-env supabase/functions/_shared/rateLimitCore.test.ts
 *
 * The limiter's 429 carried Content-Type and X-RateLimit-* and no CORS
 * headers, and every caller but manage-subscription returned it as-is. The
 * browser refused it for missing Access-Control-Allow-Origin, supabase-js
 * reported a network error, and the client's own "rate limit exceeded" branch
 * (useTripPlanner) never ran.
 *
 * --allow-env: the CORS allow-list reads SITE_URL / ENVIRONMENT. None are set
 * here, so the list is the production fallback.
 */

import { strict as assert } from 'node:assert';
import { checkRateLimit, RATE_LIMIT_EXPOSED_HEADERS, tooManyRequestsResponse } from './rateLimitCore.ts';
import { addCorsHeaders } from './cors.ts';

const ALLOWED = 'https://desmoinesinsider.com';

let ip = 0;
function request(origin?: string): Request {
  // A fresh client address per test, so one test's count never leaks into
  // another's through the shared in-memory store.
  const headers: Record<string, string> = { 'cf-connecting-ip': `203.0.113.${++ip}` };
  if (origin) headers.origin = origin;
  return new Request('https://example.supabase.co/functions/v1/generate-itinerary', {
    method: 'POST',
    headers,
  });
}

function exhaust(req: Request, max = 3) {
  for (let i = 0; i < max; i++) {
    assert.equal(checkRateLimit(req, { max }).success, true, `request ${i + 1} of ${max} is allowed`);
  }
  const blocked = checkRateLimit(req, { max, message: 'Slow down' });
  assert.equal(blocked.success, false);
  assert.ok(blocked.response, 'a blocked request carries a response');
  return blocked.response;
}

Deno.test('the in-memory 429 allows the requesting origin', async () => {
  const res = exhaust(request(ALLOWED));
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ALLOWED);
  assert.equal(res.headers.get('Vary'), 'Origin');
  assert.deepEqual(await res.json(), { error: 'Slow down', retryAfter: Number(res.headers.get('Retry-After')) });
});

Deno.test('the 429 exposes Retry-After and X-RateLimit-* to the page', () => {
  const res = exhaust(request(ALLOWED));
  const exposed = (res.headers.get('Access-Control-Expose-Headers') ?? '').split(',').map((h) => h.trim());
  for (const h of ['Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']) {
    assert.ok(exposed.includes(h), `${h} must be exposed`);
    assert.ok(res.headers.get(h) !== null, `${h} must be present`);
  }
  assert.equal(res.headers.get('X-RateLimit-Remaining'), '0');
});

Deno.test('an origin off the allow-list is not echoed back', () => {
  const res = exhaust(request('https://evil.example'));
  const acao = res.headers.get('Access-Control-Allow-Origin');
  assert.notEqual(acao, 'https://evil.example');
  assert.notEqual(acao, '*');
});

Deno.test('a request with no Origin still gets a well-formed 429', () => {
  const res = exhaust(request());
  assert.equal(res.status, 429);
  assert.ok(res.headers.get('Access-Control-Allow-Origin'));
});

Deno.test('wrapping in addCorsHeaders again (manage-subscription) changes nothing', () => {
  const res = exhaust(request(ALLOWED));
  const wrapped = addCorsHeaders(res, ALLOWED);
  assert.equal(wrapped.status, 429);
  assert.equal(wrapped.headers.get('Access-Control-Allow-Origin'), ALLOWED);
  assert.equal(wrapped.headers.get('Access-Control-Expose-Headers'), RATE_LIMIT_EXPOSED_HEADERS);
  assert.equal(wrapped.headers.get('Retry-After'), res.headers.get('Retry-After'));
});

Deno.test('the persistent path builds the same 429', async () => {
  // checkRateLimitDB needs a database; it hands its numbers to this builder,
  // which is what the browser actually receives.
  const res = tooManyRequestsResponse(request(ALLOWED), {
    message: 'Too many itinerary requests',
    limit: 10,
    resetTime: 1_700_000_000_000,
    retryAfter: 42,
  });
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ALLOWED);
  assert.equal(res.headers.get('Retry-After'), '42');
  assert.equal(res.headers.get('X-RateLimit-Limit'), '10');
  assert.deepEqual(await res.json(), { error: 'Too many itinerary requests', retryAfter: 42 });
});
