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
