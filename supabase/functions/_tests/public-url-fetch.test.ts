/**
 * Stored and scraped URLs are fetched through fetchPublicUrl (WEB-SEC-059).
 *
 * Run with:
 *   deno test --allow-read --allow-env supabase/functions/_tests/public-url-fetch.test.ts
 *
 * THE HOLE. scrape-restaurant-menus checked restaurants.website with
 * isPublicHttpUrl (a regex over the URL as typed) and then called fetch(),
 * which follows redirects. A public site answering 302 Location:
 * http://169.254.169.254/ was fetched anyway, and so was a public-looking name
 * that resolves to 10.x. The page text then goes to Claude and the extracted
 * "menu" is stored, so this was a read-back SSRF, not a blind one. The PDF and
 * image downloads it makes (scraper.ts) and backfill-images' venue-site scrape
 * (imageFallbacks.ts) had no check at all.
 *
 * Every test stubs globalThis.fetch; nothing touches the network. Public hosts
 * are written as literal public IPs so the resolving check needs no DNS.
 */

import { strict as assert } from 'node:assert';
import { fetchPublicUrl, PUBLIC_URL_MAX_REDIRECTS, UnsafeFetchError } from '../_shared/fetchGuard.ts';
import { validateURLForSSRF } from '../_shared/validation.ts';
import { fetchImageAsBase64, fetchPdfAsBase64 } from '../_shared/scraper.ts';
import { scrapeImageFromWebsite } from '../_shared/imageFallbacks.ts';
import { scrapeUrl } from '../_shared/scraper.ts';
import { _clearRobotsCache } from '../_shared/robots.ts';
import { fetchListingHtml } from '../_shared/eventPageDiscovery.ts';

type Route = () => Response;
type Call = { url: string; init: RequestInit };

async function withStubbedFetch(
  routes: Record<string, Route>,
  run: (calls: Call[]) => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = ((input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    const route = routes[url];
    if (!route) return Promise.reject(new Error(`unexpected fetch: ${url}`));
    return Promise.resolve(route());
  }) as typeof fetch;
  try {
    await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

const redirect = (location: string, status = 302): Route => () =>
  new Response(null, { status, headers: { location } });
const html = (body: string): Route => () =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });

// 93.184.216.34 and 93.184.216.35 are public literals; resolvesToPrivateAddress
// classifies a literal without a lookup.
const SITE = 'http://93.184.216.34';
const METADATA = 'http://169.254.169.254/latest/meta-data/';

// ── the helper ──────────────────────────────────────────────────────────────

Deno.test('fetchPublicUrl refuses a first host that resolves to a private address', async () => {
  // The resolving check is injected here: a real lookup needs --allow-net.
  const resolver = (u: string) =>
    new URL(u).hostname === 'menu.example.com'
      ? { valid: false, error: 'Host resolves to a private/internal address' }
      : validateURLForSSRF(u, { allowedProtocols: ['http:', 'https:'] });
  await withStubbedFetch({}, async (calls) => {
    await assert.rejects(
      fetchPublicUrl('https://menu.example.com/', {}, { validateHop: resolver }),
      (err: unknown) => err instanceof UnsafeFetchError && /private/.test((err as Error).message),
    );
    assert.equal(calls.length, 0, 'the host was fetched before it was checked');
  });
});

Deno.test('fetchPublicUrl refuses a public 302 onto the metadata address', async () => {
  await withStubbedFetch({ [`${SITE}/`]: redirect(METADATA) }, async (calls) => {
    await assert.rejects(fetchPublicUrl(`${SITE}/`), UnsafeFetchError);
    assert.equal(calls.length, 1, 'the metadata address was fetched');
    assert.equal(calls[0].init.redirect, 'manual');
  });
});

Deno.test('fetchPublicUrl follows a normal site redirect chain', async () => {
  await withStubbedFetch(
    {
      [`${SITE}/`]: redirect('http://93.184.216.35/'),
      'http://93.184.216.35/': redirect('http://93.184.216.35/home', 301),
      'http://93.184.216.35/home': html('<h1>Menu</h1>'),
    },
    async (calls) => {
      const res = await fetchPublicUrl(`${SITE}/`);
      assert.equal(res.status, 200);
      assert.equal(await res.text(), '<h1>Menu</h1>');
      assert.equal(calls.length, 3);
    },
  );
});

Deno.test('fetchPublicUrl allows more hops than safeFetch does', async () => {
  const routes: Record<string, Route> = {};
  for (let i = 0; i < PUBLIC_URL_MAX_REDIRECTS; i++) routes[`${SITE}/${i}`] = redirect(`${SITE}/${i + 1}`);
  routes[`${SITE}/${PUBLIC_URL_MAX_REDIRECTS}`] = html('ok');
  await withStubbedFetch(routes, async () => {
    const res = await fetchPublicUrl(`${SITE}/0`);
    assert.equal(res.status, 200);
  });
});

// ── the callers, end to end against the stub ────────────────────────────────

Deno.test('scrapeImageFromWebsite does not fetch a private website at all', async () => {
  await withStubbedFetch({}, async (calls) => {
    assert.equal(await scrapeImageFromWebsite('http://10.0.0.5/'), null);
    assert.equal(calls.length, 0, 'a private address was fetched');
  });
});

Deno.test('scrapeImageFromWebsite does not follow a redirect onto the metadata address', async () => {
  await withStubbedFetch({ [`${SITE}/`]: redirect(METADATA) }, async (calls) => {
    assert.equal(await scrapeImageFromWebsite(`${SITE}/`), null);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.redirect, 'manual', 'fetch() was left to follow redirects');
  });
});

Deno.test('scrapeImageFromWebsite still finds the og:image on a public site', async () => {
  await withStubbedFetch(
    { [`${SITE}/`]: html('<html><head><meta property="og:image" content="https://cdn.example.com/hero.jpg"></head></html>') },
    async () => {
      assert.equal(await scrapeImageFromWebsite(`${SITE}/`), 'https://cdn.example.com/hero.jpg');
    },
  );
});

Deno.test('fetchPdfAsBase64 refuses a private menu link and a redirect to one', async () => {
  await withStubbedFetch({ [`${SITE}/menu.pdf`]: redirect('http://192.168.1.10/menu.pdf') }, async (calls) => {
    assert.equal(await fetchPdfAsBase64('http://127.0.0.1:8080/menu.pdf'), null);
    assert.equal(calls.length, 0, 'loopback was fetched');
    assert.equal(await fetchPdfAsBase64(`${SITE}/menu.pdf`), null);
    assert.equal(calls.length, 1, 'the redirect target was fetched');
  });
});

Deno.test('fetchImageAsBase64 refuses a redirect onto a private address', async () => {
  await withStubbedFetch({ [`${SITE}/menu.jpg`]: redirect('http://10.1.2.3/menu.jpg') }, async (calls) => {
    assert.equal(await fetchImageAsBase64(`${SITE}/menu.jpg`), null);
    assert.ok(calls.every((c) => !c.url.includes('10.1.2.3')), 'the private address was fetched');
    assert.equal(calls[0].init.redirect, 'manual', 'fetch() was left to follow redirects');
  });
});

// ── wiring: the menu scraper's own fetches ──────────────────────────────────
// Its index.ts calls Deno.serve at module load, so it is read, not imported.

const REPO = new URL('../../../', import.meta.url);
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
// String contents go too: a log line saying "fetch(es) unused" is not a call.
const withoutStrings = (src: string) =>
  src.replace(/`[^`]*`/g, '``').replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");

Deno.test('scrape-restaurant-menus makes no bare fetch() of a restaurant URL', async () => {
  const src = codeOnly(await Deno.readTextFile(new URL('supabase/functions/scrape-restaurant-menus/index.ts', REPO)));
  assert.match(src, /import \{ fetchPublicUrl \} from "\.\.\/_shared\/fetchGuard\.ts"/);
  const bare = withoutStrings(src).split('\n').filter((l) => /(^|[^\w.])fetch\(/.test(l));
  assert.deepEqual(bare, [], `bare fetch() calls remain:\n${bare.join('\n')}`);
  assert.ok((src.match(/\bfetchPublicUrl\(/g) ?? []).length >= 2, 'page and sitemap fetches are not both guarded');
});

// ── scrapeUrl's fetch backend and robots.txt check (WEB-SEC-060) ────────────
// The fetch backend is scrapeUrl's last-resort fallback for every ingestion
// path, and the robots.txt check runs before any backend; both ran on our own
// network with fetch(), which followed redirects. The other backends are
// switched off here (empty keys), so only those two can reach the stub.

const FETCH_ONLY = { backend: 'fetch' as const, browserlessApiKey: '', browserlessBackupApiKey: '', firecrawlApiKey: '' };
const notFound: Route = () => new Response('', { status: 404 });

Deno.test('scrapeUrl (fetch backend) makes no request at all for a private URL', async () => {
  _clearRobotsCache();
  await withStubbedFetch({}, async (calls) => {
    const result = await scrapeUrl('http://10.0.0.5/admin', FETCH_ONLY);
    assert.equal(result.success, false);
    assert.equal(calls.length, 0, `fetched: ${calls.map((c) => c.url).join(', ')}`);
  });
});

Deno.test('scrapeUrl (fetch backend) does not follow a page redirect onto the metadata address', async () => {
  _clearRobotsCache();
  await withStubbedFetch(
    { [`${SITE}/robots.txt`]: notFound, [`${SITE}/events`]: redirect(METADATA) },
    async (calls) => {
      const result = await scrapeUrl(`${SITE}/events`, FETCH_ONLY);
      assert.equal(result.success, false);
      assert.match(result.error ?? '', /Refused redirect/);
      assert.ok(calls.every((c) => !c.url.startsWith('http://169.254.')), 'the metadata address was fetched');
      assert.ok(calls.every((c) => c.init.redirect === 'manual'), 'fetch() was left to follow redirects');
    },
  );
});

Deno.test('the robots.txt check does not follow a redirect onto the metadata address', async () => {
  _clearRobotsCache();
  await withStubbedFetch(
    { [`${SITE}/robots.txt`]: redirect(METADATA), [`${SITE}/listing`]: html('<p>Events</p>') },
    async (calls) => {
      const result = await scrapeUrl(`${SITE}/listing`, FETCH_ONLY);
      // A refused robots.txt reads as "no rules", so the page itself is still scraped.
      assert.equal(result.success, true);
      assert.ok(calls.every((c) => !c.url.startsWith('http://169.254.')), 'the metadata address was fetched');
      // The stub never follows a redirect itself, so the check that matters is
      // that the robots.txt request was not sent with fetch()'s default follow.
      const robots = calls.find((c) => c.url === `${SITE}/robots.txt`);
      assert.equal(robots?.init.redirect, 'manual', 'robots.txt was fetched with redirect: follow');
    },
  );
});

Deno.test('scrapeUrl (fetch backend) still scrapes a public page through a normal redirect', async () => {
  _clearRobotsCache();
  await withStubbedFetch(
    {
      [`${SITE}/robots.txt`]: notFound,
      [`${SITE}/calendar`]: redirect(`${SITE}/calendar/`, 301),
      [`${SITE}/calendar/`]: html('<html><body><h1>Jazz in July</h1><script>x()</script></body></html>'),
    },
    async () => {
      const result = await scrapeUrl(`${SITE}/calendar`, FETCH_ONLY);
      assert.equal(result.success, true);
      assert.equal(result.backend, 'fetch');
      assert.equal(result.text, 'Jazz in July');
    },
  );
});

Deno.test('eventPageDiscovery fetchText refuses a private URL and a redirect to one', async () => {
  await withStubbedFetch(
    { [`${SITE}/e/1`]: redirect('http://192.168.0.20/e/1'), [`${SITE}/e/2`]: html('<h1>Show</h1>') },
    async (calls) => {
      assert.equal(await fetchListingHtml('http://127.0.0.1:54321/rest/v1/'), null);
      assert.equal(calls.length, 0, 'loopback was fetched');
      assert.equal(await fetchListingHtml(`${SITE}/e/1`), null);
      assert.equal(calls.length, 1, 'the redirect target was fetched');
      assert.equal(calls[0].init.redirect, 'manual', 'fetch() was left to follow redirects');
      assert.equal(await fetchListingHtml(`${SITE}/e/2`), '<h1>Show</h1>');
    },
  );
});

Deno.test('scrapeWithFetch, fetchText and the robots.txt fetch make no bare fetch()', async () => {
  const read = async (path: string) =>
    withoutStrings(codeOnly(await Deno.readTextFile(new URL(`supabase/functions/_shared/${path}`, REPO))));
  const scraper = await read('scraper.ts');
  const start = scraper.indexOf('async function scrapeWithFetch(');
  const body = scraper.slice(start, scraper.indexOf('\nasync function ', start + 1));
  assert.ok(start >= 0 && body.length > 0, 'scrapeWithFetch not found');
  for (const [name, src] of [
    ['scraper.ts scrapeWithFetch', body],
    ['eventPageDiscovery.ts', await read('eventPageDiscovery.ts')],
    ['robots.ts', await read('robots.ts')],
  ] as const) {
    const bare = src.split('\n').filter((l) => /(^|[^\w.])fetch\(/.test(l));
    assert.deepEqual(bare, [], `${name} still calls fetch() directly:\n${bare.join('\n')}`);
  }
});
