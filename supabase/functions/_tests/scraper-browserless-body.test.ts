/**
 * The Browserless request BODY carries the configured User-Agent.
 *
 * The 'User-Agent' request header only reaches Browserless itself. The browser
 * it drives keeps its own UA ("HeadlessChrome") unless the body sets
 * `userAgent: { userAgent }`. Browserless.io's hosted service happened to mask
 * that; a self-hosted ghcr.io/browserless/chromium does not, and Catch Des
 * Moines (Akamai) answered HeadlessChrome with a 791-byte Access Denied page and
 * zero event links. Same /scrape body with the field set: 480 KB, 7 event links
 * (measured 2026-10-12 against browse.dpearsonmedia.com).
 *
 * Driven through scrapeUrl with a fake fetch, so the bodies asserted on are the
 * ones scraper.ts actually builds, not a copy of them.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { browserlessUserAgent, getScraperConfig, scrapeUrl } from '../_shared/scraper.ts';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TestAgent/1.0';
const WAIT = 4321;
const BASE = 'https://browserless.test';
const PAGE = '<html><head></head><body>events</body></html>';

interface Seen {
  url: string;
  body: Record<string, unknown>;
}

async function withFakeFetch(
  scrapeStatus: number,
  fn: (seen: Seen[]) => Promise<void>,
): Promise<void> {
  const seen: Seen[] = [];
  const realFetch = globalThis.fetch;
  const priorIgnore = Deno.env.get('SCRAPER_IGNORE_ROBOTS');
  const priorUa = Deno.env.get('SCRAPER_USER_AGENT');
  Deno.env.set('SCRAPER_IGNORE_ROBOTS', 'true');
  Deno.env.set('SCRAPER_USER_AGENT', UA);
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    seen.push({ url, body });
    if (url.startsWith(`${BASE}/scrape`)) {
      return Promise.resolve(
        scrapeStatus === 200
          ? new Response(JSON.stringify({ data: [{ results: [{ html: PAGE }] }] }), { status: 200 })
          : new Response('boom', { status: scrapeStatus }),
      );
    }
    if (url.startsWith(`${BASE}/content`)) {
      return Promise.resolve(new Response(PAGE, { status: 200 }));
    }
    return Promise.resolve(new Response('unexpected', { status: 599 }));
  }) as typeof fetch;
  try {
    await fn(seen);
  } finally {
    globalThis.fetch = realFetch;
    if (priorIgnore === undefined) Deno.env.delete('SCRAPER_IGNORE_ROBOTS');
    else Deno.env.set('SCRAPER_IGNORE_ROBOTS', priorIgnore);
    if (priorUa === undefined) Deno.env.delete('SCRAPER_USER_AGENT');
    else Deno.env.set('SCRAPER_USER_AGENT', priorUa);
  }
}

const config = {
  backend: 'browserless' as const,
  browserlessApiKey: 'test-token',
  browserlessUrl: BASE,
  waitTime: WAIT,
};

Deno.test('/scrape body sets the browser User-Agent to the configured UA', async () => {
  await withFakeFetch(200, async (seen) => {
    const result = await scrapeUrl('https://example.com/events', config);
    assert(result.success, `scrape failed: ${result.error}`);
    const call = seen.find((s) => s.url.startsWith(`${BASE}/scrape`));
    assert(call, 'no /scrape request was made');
    assertEquals(call.body.userAgent, { userAgent: UA });
    assertEquals(call.body.waitForTimeout, WAIT);
    assertEquals(
      seen.some((s) => s.url.startsWith(`${BASE}/content`)),
      false,
      'a successful /scrape must not fall back to /content',
    );
  });
});

Deno.test('/content fallback body sets the UA and waits like /scrape', async () => {
  await withFakeFetch(500, async (seen) => {
    const result = await scrapeUrl('https://example.com/events', config);
    assert(result.success, `scrape failed: ${result.error}`);
    const call = seen.find((s) => s.url.startsWith(`${BASE}/content`));
    assert(call, '/scrape returned 500 but /content was never called');
    assertEquals(call.body.userAgent, { userAgent: UA });
    assertEquals(call.body.waitForTimeout, WAIT);
  });
});

Deno.test('the SCRAPER_USER_AGENT override is what reaches the body', async () => {
  // Control for the two tests above: the UA comes from the environment through
  // getScraperConfig, so a hardcoded body value would fail here.
  await withFakeFetch(200, async (seen) => {
    Deno.env.set('SCRAPER_USER_AGENT', 'OtherAgent/2.0');
    await scrapeUrl('https://example.com/events', config);
    const call = seen.find((s) => s.url.startsWith(`${BASE}/scrape`));
    assertEquals(call?.body.userAgent, { userAgent: 'OtherAgent/2.0' });
  });
});

Deno.test('browserlessUserAgent adds no field when no UA is configured', () => {
  assertEquals(browserlessUserAgent({ userAgent: undefined }), {});
  assertEquals(browserlessUserAgent({ userAgent: '' }), {});
  assertEquals(browserlessUserAgent({ userAgent: UA }), { userAgent: { userAgent: UA } });
});

Deno.test('the default UA is a current desktop Chrome string', () => {
  const prior = Deno.env.get('SCRAPER_USER_AGENT');
  Deno.env.delete('SCRAPER_USER_AGENT');
  try {
    const ua = getScraperConfig().userAgent ?? '';
    assert(ua.includes('Chrome/141.0.0.0'), `default UA is ${ua}`);
    assert(!ua.includes('Headless'), 'the default must not announce a headless browser');
  } finally {
    if (prior !== undefined) Deno.env.set('SCRAPER_USER_AGENT', prior);
  }
});

Deno.test('hyveetix posts to the configured Browserless host with the UA field', () => {
  const src = Deno.readTextFileSync(
    new URL('../_shared/domain-adapters/hyveetix.ts', import.meta.url),
  )
    // Whole-line comments only: a trailing-// strip would also eat the
    // https:// of a URL literal and make the negative check below vacuous.
    .replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');
  assert(/browserlessUserAgent\(config\)/.test(src), 'hyveetix body must set the browser UA');
  assert(
    !/production-sfo\.browserless\.io/.test(src),
    'hyveetix must not pin the hosted Browserless host; BROWSERLESS_URL decides',
  );
});
