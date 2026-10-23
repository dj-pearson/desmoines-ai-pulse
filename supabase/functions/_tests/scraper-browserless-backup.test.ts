/**
 * Primary -> backup Browserless fallback (BROWSERLESS_API_KEY_BACKUP).
 *
 * The primary is the self-hosted instance; the backup is a Browserless.io
 * (hosted) account. When the primary errors or renders an access-denied page,
 * the render is retried ONCE on the backup. The property that matters most is
 * that each key only ever reaches its own host: every test below ends by
 * checking every request the fake fetch saw.
 */
import { assert, assertEquals, assertFalse, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  browserlessHosts,
  HOSTED_BROWSERLESS_URL,
  isAccessDeniedPage,
  redactBrowserlessToken,
  scrapeUrl,
  withBrowserlessFallback,
} from '../_shared/scraper.ts';

const PRIMARY = 'https://primary.test';
const BACKUP = 'https://backup.test';
const PRIMARY_KEY = 'primary-token-aaa';
const BACKUP_KEY = 'backup-token-bbb';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TestAgent/1.0';

const REAL_PAGE = `<html><head><title>Events</title></head><body>${'<a href="/event/x">x</a>'.repeat(50)}</body></html>`;
/** Shape of the Catch Des Moines denial as the rendered DOM returns it: HTTP 200, a few hundred bytes. */
const AKAMAI_DENIED =
  '<html><head><title>Access Denied</title></head><body><h1>Access Denied</h1>' +
  'You don\'t have permission to access "http://www.catchdesmoines.com/events/" on this server.<p>' +
  'Reference #18.5c2e3e17.1760000000.1a2b3c4d</p><p>https://errors.edgesuite.net/18.5c2e3e17.1760000000.1a2b3c4d</p>' +
  '</body></html>';

type Behaviour = { status: number; body: string } | 'throw';

interface Seen {
  host: string;
  path: string;
  token: string | null;
  body: Record<string, unknown>;
}

async function run(
  hosts: Record<string, Behaviour>,
  fn: (seen: Seen[]) => Promise<void>,
): Promise<void> {
  const seen: Seen[] = [];
  const realFetch = globalThis.fetch;
  const saved = new Map<string, string | undefined>();
  for (const k of ['SCRAPER_IGNORE_ROBOTS', 'SCRAPER_USER_AGENT', 'BROWSERLESS_BACKUP_URL', 'BROWSERLESS_API_KEY_BACKUP', 'FIRECRAWL_API_KEY']) {
    saved.set(k, Deno.env.get(k));
  }
  Deno.env.set('SCRAPER_IGNORE_ROBOTS', 'true');
  Deno.env.set('SCRAPER_USER_AGENT', UA);
  Deno.env.delete('BROWSERLESS_BACKUP_URL');
  Deno.env.delete('BROWSERLESS_API_KEY_BACKUP');
  Deno.env.delete('FIRECRAWL_API_KEY');
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(href);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    seen.push({ host: u.origin, path: u.pathname, token: u.searchParams.get('token'), body });
    const b = hosts[u.origin];
    if (!b) {
      // scrapeUrl's last-resort plain fetch of the target page itself.
      return Promise.resolve(new Response('plain fetch', { status: 503 }));
    }
    if (b === 'throw') {
      return Promise.reject(new TypeError(`error sending request for url (${href})`));
    }
    const payload = u.pathname === '/scrape'
      ? (b.status === 200 ? JSON.stringify({ data: [{ results: [{ html: b.body }] }] }) : b.body)
      : b.body;
    return Promise.resolve(new Response(payload, { status: b.status }));
  }) as typeof fetch;
  try {
    await fn(seen);
  } finally {
    globalThis.fetch = realFetch;
    for (const [k, v] of saved) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

/** No key ever crosses hosts, in either direction. */
function assertKeysStayHome(seen: Seen[]) {
  for (const s of seen) {
    if (s.host === BACKUP || s.host === HOSTED_BROWSERLESS_URL) {
      assertFalse(s.token === PRIMARY_KEY, `primary token sent to ${s.host}`);
    }
    if (s.host === PRIMARY) {
      assertFalse(s.token === BACKUP_KEY, `backup key sent to ${s.host}`);
    }
    if (s.host === PRIMARY) assertEquals(s.token, PRIMARY_KEY);
    if (s.host === BACKUP) assertEquals(s.token, BACKUP_KEY);
  }
}

const cfg = (over: Record<string, unknown> = {}) => ({
  backend: 'browserless' as const,
  browserlessApiKey: PRIMARY_KEY,
  browserlessUrl: PRIMARY,
  browserlessBackupApiKey: BACKUP_KEY,
  browserlessBackupUrl: BACKUP,
  ...over,
});

const browserlessCalls = (seen: Seen[], host: string) => seen.filter((s) => s.host === host);

Deno.test('primary 200 with a real page: backup is never called', async () => {
  await run({ [PRIMARY]: { status: 200, body: REAL_PAGE }, [BACKUP]: { status: 200, body: REAL_PAGE } }, async (seen) => {
    const r = await scrapeUrl('https://example.com/events', cfg());
    assert(r.success, r.error);
    assertEquals(r.browserlessHost, 'primary');
    assertEquals(r.backend, 'browserless');
    assertEquals(browserlessCalls(seen, BACKUP).length, 0);
    assertKeysStayHome(seen);
  });
});

Deno.test('primary 401: backup is used with the backup key on the backup host', async () => {
  await run({ [PRIMARY]: { status: 401, body: 'bad token' }, [BACKUP]: { status: 200, body: REAL_PAGE } }, async (seen) => {
    const r = await scrapeUrl('https://example.com/events', cfg());
    assert(r.success, r.error);
    assertEquals(r.browserlessHost, 'backup');
    assertEquals(r.html, REAL_PAGE);
    // Primary tried /scrape then /content; backup needed only /scrape.
    assertEquals(browserlessCalls(seen, PRIMARY).map((s) => s.path), ['/scrape', '/content']);
    const backup = browserlessCalls(seen, BACKUP);
    assertEquals(backup.map((s) => s.path), ['/scrape']);
    assertEquals(backup[0].token, BACKUP_KEY);
    // Same request body on the backup, UA field included.
    assertEquals(backup[0].body.userAgent, { userAgent: UA });
    assertEquals(backup[0].body, browserlessCalls(seen, PRIMARY)[0].body);
    assertKeysStayHome(seen);
  });
});

Deno.test('primary 200 with an Akamai Access Denied body: backup is used', async () => {
  await run({ [PRIMARY]: { status: 200, body: AKAMAI_DENIED }, [BACKUP]: { status: 200, body: REAL_PAGE } }, async (seen) => {
    const r = await scrapeUrl('https://example.com/events', cfg());
    assert(r.success, r.error);
    assertEquals(r.browserlessHost, 'backup');
    assertEquals(r.html, REAL_PAGE);
    assertEquals(browserlessCalls(seen, BACKUP).length, 1);
    assertKeysStayHome(seen);
  });
});

Deno.test('backup unset: no retry, the primary error is returned', async () => {
  await run({ [PRIMARY]: { status: 401, body: 'bad token' }, [BACKUP]: { status: 200, body: REAL_PAGE } }, async (seen) => {
    const r = await scrapeUrl('https://example.com/events', cfg({ browserlessBackupApiKey: '' }));
    assertFalse(r.success);
    assertEquals(browserlessCalls(seen, BACKUP).length, 0);
    assertEquals(browserlessCalls(seen, HOSTED_BROWSERLESS_URL).length, 0);
    assertKeysStayHome(seen);
  });
  // scrapeUrl's last-resort plain fetch overwrites result.error, so the
  // primary's own error is checked at the helper.
  await run({ [PRIMARY]: { status: 401, body: 'bad token' } }, async (seen) => {
    let calls = 0;
    const out = await withBrowserlessFallback(cfg({ browserlessBackupApiKey: '' }), async (host) => {
      calls++;
      const res = await fetch(`${host.baseUrl}/content?token=${host.apiKey}`, { method: 'POST', body: '{}' });
      return { ok: false, error: `HTTP ${res.status} ${await res.text()}` };
    });
    assertEquals(calls, 1);
    assertEquals(out, { ok: false, error: 'HTTP 401 bad token', host: 'primary' });
    assertKeysStayHome(seen);
  });
});

Deno.test('primary already on the hosted service: no second attempt there', async () => {
  await run({ [HOSTED_BROWSERLESS_URL]: { status: 401, body: 'bad token' } }, async (seen) => {
    const r = await scrapeUrl(
      'https://example.com/events',
      cfg({ browserlessUrl: HOSTED_BROWSERLESS_URL, browserlessBackupUrl: undefined }),
    );
    assertFalse(r.success);
    const hosted = browserlessCalls(seen, HOSTED_BROWSERLESS_URL);
    // One render attempt (/scrape then /content), all with the primary key.
    assertEquals(hosted.map((s) => s.path), ['/scrape', '/content']);
    assert(hosted.every((s) => s.token === PRIMARY_KEY));
    assertFalse(seen.some((s) => s.token === BACKUP_KEY), 'backup key must not be sent at all');
  });
});

Deno.test('both fail: one backup attempt, and both errors are returned', async () => {
  await run({ [PRIMARY]: { status: 500, body: 'primary down' }, [BACKUP]: { status: 402, body: 'units exhausted' } }, async (seen) => {
    const r = await scrapeUrl('https://example.com/events', cfg());
    assertFalse(r.success);
    assertEquals(browserlessCalls(seen, BACKUP).map((s) => s.path), ['/scrape', '/content']);
    assertKeysStayHome(seen);
  });
  // Driven through the helper so the combined message is visible before
  // scrapeUrl's later plain-fetch fallback replaces it.
  await run({ [PRIMARY]: { status: 500, body: 'primary down' }, [BACKUP]: { status: 402, body: 'units exhausted' } }, async (seen) => {
    let calls = 0;
    const out = await withBrowserlessFallback(cfg(), async (host) => {
      calls++;
      const res = await fetch(`${host.baseUrl}/content?token=${host.apiKey}`, { method: 'POST', body: '{}' });
      return { ok: false, error: `${host.label} HTTP ${res.status} ${await res.text()}` };
    });
    assertEquals(calls, 2, 'exactly one primary and one backup attempt');
    assertFalse(out.ok);
    if (!out.ok) {
      assertStringIncludes(out.error, 'primary: primary HTTP 500 primary down');
      assertStringIncludes(out.error, 'backup: backup HTTP 402 units exhausted');
    }
    assertKeysStayHome(seen);
  });
});

Deno.test('a thrown fetch never puts a token into the error', async () => {
  await run({ [PRIMARY]: 'throw', [BACKUP]: 'throw' }, async (seen) => {
    const out = await withBrowserlessFallback(cfg(), async (host) => {
      await fetch(`${host.baseUrl}/content?token=${host.apiKey}&stealth=true`, { method: 'POST' });
      return { ok: true, value: 'unreachable' };
    });
    assertFalse(out.ok);
    if (!out.ok) {
      assertFalse(out.error.includes(PRIMARY_KEY), out.error);
      assertFalse(out.error.includes(BACKUP_KEY), out.error);
      assertStringIncludes(out.error, 'token=[redacted]');
    }
    assertKeysStayHome(seen);
  });
  await run({ [PRIMARY]: 'throw', [BACKUP]: 'throw' }, async () => {
    const r = await scrapeUrl('https://example.com/events', cfg());
    assertFalse((r.error ?? '').includes(PRIMARY_KEY));
    assertFalse((r.error ?? '').includes(BACKUP_KEY));
  });
});

Deno.test('browserlessHosts pairs each key with its own host only', () => {
  const { primary, backup } = browserlessHosts(cfg());
  assertEquals(primary, { label: 'primary', baseUrl: PRIMARY, apiKey: PRIMARY_KEY });
  assertEquals(backup, { label: 'backup', baseUrl: BACKUP, apiKey: BACKUP_KEY });
  // Default backup URL is the hosted service.
  assertEquals(browserlessHosts(cfg({ browserlessBackupUrl: undefined })).backup?.baseUrl, HOSTED_BROWSERLESS_URL);
  // Same host either side, even with a trailing slash: no backup.
  assertEquals(browserlessHosts(cfg({ browserlessBackupUrl: `${PRIMARY}/` })).backup, null);
});

Deno.test('isAccessDeniedPage matches Akamai markers, not size', () => {
  assert(isAccessDeniedPage(AKAMAI_DENIED));
  assert(isAccessDeniedPage('<HTML><HEAD>\n<TITLE>Access Denied</TITLE>\n</HEAD><BODY></BODY></HTML>'));
  assert(isAccessDeniedPage('<p>see https://errors.edgesuite.net/18.abc</p>'));
  // A real small page with no marker is not a denial.
  assertFalse(isAccessDeniedPage('<html><head><title>Events</title></head><body>No events this week.</body></html>'));
  // "Access Denied" in ordinary text is not the title or heading.
  assertFalse(isAccessDeniedPage('<html><head><title>Help</title></head><body><p>If you see Access Denied, retry.</p></body></html>'));
  // A long page carrying the words in its title is a real page about them.
  assertFalse(isAccessDeniedPage(`<html><head><title>Access Denied</title></head><body>${'x'.repeat(5000)}</body></html>`));
  assertFalse(isAccessDeniedPage(''));
});

Deno.test('redactBrowserlessToken removes the token value only', () => {
  assertEquals(
    redactBrowserlessToken('error sending request for url (https://h/content?token=abc123&stealth=true)'),
    'error sending request for url (https://h/content?token=[redacted]&stealth=true)',
  );
});

Deno.test('hyveetix routes Browserless through the shared fallback helper', () => {
  const src = Deno.readTextFileSync(
    new URL('../_shared/domain-adapters/hyveetix.ts', import.meta.url),
  ).replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');
  assert(/withBrowserlessFallback(<[^>]*>)?\(/.test(src), 'hyveetix must use withBrowserlessFallback');
  assert(/\$\{host\.baseUrl\}\/content\?token=\$\{host\.apiKey\}/.test(src), 'request built from the handed-in host');
  assertFalse(/BROWSERLESS_API/.test(src), 'hyveetix must not read Browserless keys itself');
});
