/**
 * fetchGuard image allowlist tests.
 * Run with: `deno test --allow-env supabase/functions/_shared/fetchGuard.test.ts`
 *
 * The image-transform proxy must accept storage URLs from both backends while
 * Des Moines Insider moves off Supabase Cloud: the cloud project's
 * <ref>.supabase.co and the self-hosted api.desmoinesinsider.com.
 */
import {
  fetchArrayBufferWithSizeCap,
  isImageHostAllowed,
  safeFetch,
  UnsafeFetchError,
} from './fetchGuard.ts';
import { validateURLForSSRF } from './validation.ts';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

const STORAGE_PATH = '/storage/v1/object/public/event-images/x.jpg';

Deno.test('self-hosted storage host is allowed', () => {
  const r = isImageHostAllowed(`https://api.desmoinesinsider.com${STORAGE_PATH}`);
  assert(r.allowed, `api.desmoinesinsider.com refused: ${r.reason}`);
});

Deno.test('cloud storage host is still allowed', () => {
  const r = isImageHostAllowed(`https://wtkhfqpmcegzcbngroui.supabase.co${STORAGE_PATH}`);
  assert(r.allowed, `cloud storage host refused: ${r.reason}`);
});

Deno.test('a look-alike host is refused (suffix match needs the dot)', () => {
  const r = isImageHostAllowed(`https://evil-desmoinesinsider.com${STORAGE_PATH}`);
  assert(!r.allowed, 'evil-desmoinesinsider.com was allowed');
  const r2 = isImageHostAllowed(`https://desmoinesinsider.com.evil.example${STORAGE_PATH}`);
  assert(!r2.allowed, 'desmoinesinsider.com.evil.example was allowed');
});

// --- safeFetch: redirects must not walk past the SSRF guard -----------------
//
// fetch() follows redirects by default, so validating only the first URL let a
// public host that answers 302 Location: http://169.254.169.254/ reach the
// metadata service. These stub globalThis.fetch; nothing touches the network.

type Route = (url: string, init: RequestInit) => Response;

async function withStubbedFetch(
  routes: Record<string, Route>,
  run: (calls: { url: string; init: RequestInit }[]) => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = ((input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    const route = routes[url];
    if (!route) return Promise.reject(new Error(`unexpected fetch: ${url}`));
    return Promise.resolve(route(url, init));
  }) as typeof fetch;
  try {
    await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

const redirect = (status: number, location: string): Route => () =>
  new Response(null, { status, headers: { location } });
const image: Route = () =>
  new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } });

// The default hop check resolves DNS, which needs --allow-net and a network.
// Public-host tests use the literal check instead; the private-address tests
// use the default, because a literal private IP is refused before any lookup.
const literalHop = (u: string) =>
  validateURLForSSRF(u, { allowedProtocols: ['http:', 'https:'], blockPrivateIPs: true });

async function rejects(p: Promise<unknown>, match: RegExp): Promise<void> {
  try {
    await p;
  } catch (err) {
    assert(err instanceof UnsafeFetchError, `expected UnsafeFetchError, got ${err}`);
    assert(match.test((err as Error).message), `message "${(err as Error).message}" does not match ${match}`);
    return;
  }
  throw new Error('assertion failed: promise resolved, expected a rejection');
}

Deno.test('safeFetch refuses a 302 to the cloud metadata address', async () => {
  await withStubbedFetch(
    { 'https://cdn.example.com/a.jpg': redirect(302, 'http://169.254.169.254/latest/meta-data/') },
    async (calls) => {
      await rejects(safeFetch('https://cdn.example.com/a.jpg'), /Refused redirect/);
      assert(calls.length === 1, `metadata host was fetched (${calls.length} calls)`);
      assert(calls[0].init.redirect === 'manual', 'request did not use redirect: manual');
    },
  );
});

Deno.test('safeFetch refuses a protocol-relative redirect onto a private host', async () => {
  await withStubbedFetch(
    { 'https://cdn.example.com/a.jpg': redirect(302, '//10.0.0.5/x.jpg') },
    async (calls) => {
      await rejects(safeFetch('https://cdn.example.com/a.jpg'), /Refused redirect/);
      assert(calls.length === 1, 'private host was fetched');
    },
  );
});

Deno.test('safeFetch follows a CDN 301 to a public https host', async () => {
  await withStubbedFetch(
    {
      'http://cdn.example.com/a.jpg': redirect(301, 'https://cdn.example.com/a.jpg'),
      'https://cdn.example.com/a.jpg': redirect(302, 'https://images.example.net/a.jpg'),
      'https://images.example.net/a.jpg': image,
    },
    async (calls) => {
      const res = await safeFetch('http://cdn.example.com/a.jpg', {}, { validateHop: literalHop });
      assert(res.status === 200, `status ${res.status}`);
      assert(res.headers.get('content-type') === 'image/png', 'wrong response returned');
      assert(calls.length === 3, `expected 3 fetches, got ${calls.length}`);
    },
  );
});

Deno.test('safeFetch accepts exactly 3 hops', async () => {
  await withStubbedFetch(
    {
      'https://a.example.com/0': redirect(302, 'https://a.example.com/1'),
      'https://a.example.com/1': redirect(307, 'https://a.example.com/2'),
      'https://a.example.com/2': redirect(308, 'https://a.example.com/3'),
      'https://a.example.com/3': image,
    },
    async () => {
      const res = await safeFetch('https://a.example.com/0', {}, { validateHop: literalHop });
      assert(res.status === 200, `status ${res.status}`);
    },
  );
});

Deno.test('safeFetch rejects a chain longer than 3 hops', async () => {
  await withStubbedFetch(
    {
      'https://a.example.com/0': redirect(302, 'https://a.example.com/1'),
      'https://a.example.com/1': redirect(302, 'https://a.example.com/2'),
      'https://a.example.com/2': redirect(302, 'https://a.example.com/3'),
      'https://a.example.com/3': redirect(302, 'https://a.example.com/4'),
      'https://a.example.com/4': image,
    },
    async (calls) => {
      await rejects(safeFetch('https://a.example.com/0', {}, { validateHop: literalHop }), /Too many redirects/);
      assert(calls.length === 4, `expected 4 fetches before giving up, got ${calls.length}`);
    },
  );
});

Deno.test('safeFetch refuses a private first URL without fetching it', async () => {
  await withStubbedFetch({}, async (calls) => {
    await rejects(safeFetch('http://127.0.0.1/'), /Refused URL/);
    assert(calls.length === 0, 'private URL was fetched');
  });
});

Deno.test('safeFetch keeps a caller allowlist across hops', async () => {
  await withStubbedFetch(
    { 'https://maps.googleapis.com/p': redirect(302, 'https://evil.example.com/x.jpg') },
    async (calls) => {
      await rejects(
        safeFetch('https://maps.googleapis.com/p', {}, {
          ssrf: { allowedDomains: ['maps.googleapis.com'], allowedProtocols: ['https:'] },
        }),
        /Domain not allowed/,
      );
      assert(calls.length === 1, 'off-allowlist hop was fetched');
    },
  );
});

Deno.test('fetchArrayBufferWithSizeCap does not follow a redirect to an internal host', async () => {
  await withStubbedFetch(
    { 'https://cdn.example.com/a.jpg': redirect(302, 'http://169.254.169.254/') },
    async (calls) => {
      await rejects(fetchArrayBufferWithSizeCap('https://cdn.example.com/a.jpg'), /Refused redirect/);
      assert(calls.length === 1, 'internal host was fetched');
    },
  );
});
