/**
 * Fetch guards for cost-/SSRF-abusable crawler functions.
 *
 * Used by ai-crawler and analyze-competitor so that — even if the admin
 * API key or an admin JWT leaks — the functions cannot be turned into an
 * open SSRF proxy or an unbounded outbound-bandwidth / Claude-cost amplifier.
 *
 * Two controls:
 *   1. A configurable fetch-domain ALLOWLIST. The target host must match a
 *      known source domain (or one of its subdomains). Operators can extend
 *      the list at runtime with the CRAWLER_DOMAIN_ALLOWLIST env var
 *      (comma-separated), or open the gate entirely with CRAWLER_ALLOW_ALL=true
 *      for one-off admin crawls of a brand-new source.
 *   2. A response-SIZE cap on direct fetches so a malicious/huge target can't
 *      stream gigabytes through the function.
 */

import {
  validateURLForSSRF,
  validateURLForSSRFResolved,
  type SSRFValidationOptions,
  type SSRFValidationResult,
} from './validation.ts';

/**
 * Known-good source domains the crawlers legitimately target. Subdomains of
 * these are allowed too (e.g. www.catchdesmoines.com matches catchdesmoines.com).
 * Keep additive — never the place to remove a domain a live pipeline depends on.
 */
export const DEFAULT_CRAWL_ALLOWLIST: readonly string[] = [
  'catchdesmoines.com',
  'desmoines.com',
  'desmoinesregister.com',
  'dsm.city',
  'dsmpartnership.com',
  'iowaeventscenter.com',
  'wellsfargoarena.com',
  'desmoinesperformingarts.org',
  // NOTE: hoytsherman.org (unhyphenated) is the REAL host. Only the hyphenated
  // spelling was listed here, so every ai-crawler run against
  // https://hoytsherman.org/events/ was rejected with 403 before any scrape —
  // that source produced zero events for this reason alone. Both spellings are
  // kept: the hyphenated one may still be seeded in existing job rows.
  'hoyt-sherman.org',
  'hoytsherman.org',
  'valairdmoines.com',
  'valairballroom.com',
  'wooly.us',
  'woolysdm.com',
  'firstfleetconcerts.com',
  'xbklive.com',
  'eventbrite.com',
  'milb.com',
  'iowacubs.com',
  'theiowabarnstormers.com',
  'iowawild.com',
  'gleague.nba.com',
  'seatgeek.com',
  'ticketmaster.com',
  'axs.com',
  // Seeded event sources that were missing entirely. vibrantmusichall.com is
  // the sharpest case: a working adapter has existed for it, but ai-crawler
  // 403'd on the host check before the adapter could ever run.
  'vibrantmusichall.com',
  'dmplayhouse.com',
  'theaterdesmoines.com',
  'des-moines-theater.com',
  'dmsymphony.org',
  'horizoneventscenter.com',
  'middlebrookfarmdsm.com',
  'bfrp.org',
  // Hy-Vee Tix / AudienceView. Allowlisted so a residential-proxy retry does
  // not also have to re-litigate the host check; the adapter itself stays
  // disabled while PerimeterX blocks us (see domain-adapters/index.ts).
  'evenue.net',
  'hyveetix.com',
  // Structured-data APIs the adapters call directly.
  'statsapi.mlb.com',
  'api.seatgeek.com',
];

/** Max bytes to read from a single direct fetch (default 10 MB). */
export const DEFAULT_MAX_FETCH_BYTES = 10 * 1024 * 1024;

/**
 * Image hosts the public image-transform proxy may fetch from. Covers project
 * Supabase storage, Google place/street imagery, common image CDNs, and the
 * event/restaurant source domains that host content images. Subdomains match
 * (e.g. wtkhfqpmcegzcbngroui.supabase.co matches supabase.co). Extend at
 * runtime with IMAGE_PROXY_DOMAIN_ALLOWLIST (comma-separated) or open the gate
 * with IMAGE_PROXY_ALLOW_ALL=true. Keep additive — this list is load-bearing
 * for images already served to shipped clients.
 */
export const DEFAULT_IMAGE_HOST_ALLOWLIST: readonly string[] = [
  // Supabase storage (any project ref subdomain)
  'supabase.co',
  'supabase.in',
  // Self-hosted Supabase storage (api.desmoinesinsider.com, suffix match)
  'desmoinesinsider.com',
  // Google places / street view imagery
  'googleapis.com',
  'googleusercontent.com',
  'ggpht.com',
  'gstatic.com',
  // Common image CDNs / hosts
  'cloudinary.com',
  'imgix.net',
  'unsplash.com',
  'images.unsplash.com',
  'cloudfront.net',
  'akamaihd.net',
  'fbcdn.net',
  'cdninstagram.com',
  'squarespace-cdn.com',
  'wixstatic.com',
  'shopify.com',
  'amazonaws.com',
  // Event/restaurant source domains that host content images
  ...DEFAULT_CRAWL_ALLOWLIST,
];

function effectiveImageAllowlist(): string[] {
  const extra = (Deno.env.get('IMAGE_PROXY_DOMAIN_ALLOWLIST') || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...DEFAULT_IMAGE_HOST_ALLOWLIST, ...extra];
}

/**
 * True when the image URL's host equals, or is a subdomain of, an allowlisted
 * image host. Honors IMAGE_PROXY_ALLOW_ALL=true as an operator escape hatch.
 */
export function isImageHostAllowed(rawUrl: string): { allowed: boolean; host?: string; reason?: string } {
  if ((Deno.env.get('IMAGE_PROXY_ALLOW_ALL') || '').toLowerCase() === 'true') {
    return { allowed: true };
  }
  let host: string;
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { allowed: false, reason: `Unsupported protocol: ${u.protocol}` };
    }
    host = u.hostname.toLowerCase();
  } catch {
    return { allowed: false, reason: 'Malformed URL' };
  }
  const allowed = effectiveImageAllowlist().some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
  return allowed
    ? { allowed: true, host }
    : {
        allowed: false,
        host,
        reason:
          `Image host "${host}" is not on the allowlist. ` +
          `Add it via the IMAGE_PROXY_DOMAIN_ALLOWLIST secret (comma-separated) ` +
          `or set IMAGE_PROXY_ALLOW_ALL=true.`,
      };
}

/** Redirect hops safeFetch follows before giving up. */
export const DEFAULT_MAX_REDIRECTS = 3;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Thrown by safeFetch when a URL or a redirect hop fails the SSRF check, or there are too many hops. */
export class UnsafeFetchError extends Error {
  readonly url: string;
  constructor(message: string, url: string) {
    super(message);
    this.name = 'UnsafeFetchError';
    this.url = url;
  }
}

export interface SafeFetchOptions {
  /** Redirect hops to follow (default 3). A chain longer than this throws. */
  maxRedirects?: number;
  /**
   * Options for the SSRF check run on the first URL and on every redirect
   * target. Pass the same options the caller validated the first URL with, so
   * an allowlisted caller keeps its allowlist across hops.
   */
  ssrf?: SSRFValidationOptions;
  /**
   * Override the check for redirect targets. Defaults to
   * validateURLForSSRFResolved with `ssrf`, which also resolves the host and
   * refuses one that points at a private address.
   */
  validateHop?: (url: string) => Promise<SSRFValidationResult> | SSRFValidationResult;
  /** The fetch to use per hop (default: globalThis.fetch, read at call time). */
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
}

/**
 * fetch() that does not let a redirect walk past the SSRF guard.
 *
 * validateURLForSSRF checks the host it is given, and fetch() follows
 * redirects by default, so a public URL that answers 302 Location:
 * http://169.254.169.254/ was fetched anyway. This sends every request with
 * redirect: "manual", validates each Location before following it, and caps
 * the chain at maxRedirects.
 *
 * The first URL gets the literal check (callers already ran it, and it needs
 * no DNS). Redirect targets get the DNS-resolving check by default, since they
 * are chosen by whoever answers the first request.
 *
 * Throws UnsafeFetchError on a refused URL or hop, or too many hops. A 3xx
 * with no Location is returned as-is, as fetch() would.
 */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  options: SafeFetchOptions = {},
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const ssrf = options.ssrf ?? { allowedProtocols: ['http:', 'https:'], blockPrivateIPs: true };
  const validateHop = options.validateHop ?? ((u: string) => validateURLForSSRFResolved(u, ssrf));
  const doFetch = options.fetchFn ?? ((u: string, i: RequestInit) => fetch(u, i));

  const first = validateURLForSSRF(url, ssrf);
  if (!first.valid) throw new UnsafeFetchError(`Refused URL: ${first.error}`, url);

  let current = url;
  let method = (init.method || 'GET').toUpperCase();
  let body = init.body;
  let headers = new Headers(init.headers);

  for (let hop = 0; ; hop++) {
    const res = await doFetch(current, { ...init, method, body, headers, redirect: 'manual' });
    if (!REDIRECT_STATUSES.has(res.status)) return res;
    const location = res.headers.get('location');
    if (!location) return res;
    try { await res.body?.cancel(); } catch { /* ignore */ }

    if (hop >= maxRedirects) {
      throw new UnsafeFetchError(`Too many redirects (more than ${maxRedirects})`, current);
    }

    let next: string;
    try {
      next = new URL(location, current).href;
    } catch {
      throw new UnsafeFetchError('Redirect to a malformed URL', current);
    }
    const check = await validateHop(next);
    if (!check.valid) {
      throw new UnsafeFetchError(`Refused redirect to ${next}: ${check.error}`, next);
    }

    // Same rules fetch() applies: 303, and 301/302 after a POST, become a GET.
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) {
      method = 'GET';
      body = undefined;
      headers.delete('content-type');
    }
    // Credentials are for the origin they were sent to.
    if (new URL(next).origin !== new URL(current).origin) {
      headers = new Headers(headers);
      headers.delete('authorization');
      headers.delete('cookie');
    }
    current = next;
  }
}

/**
 * fetch() that returns binary bytes but aborts once the body exceeds maxBytes,
 * reading the stream incrementally so an oversized target is cut off early.
 * Rejects if the cap is exceeded so callers never serve a truncated image.
 */
export async function fetchArrayBufferWithSizeCap(
  url: string,
  init: RequestInit = {},
  maxBytes = DEFAULT_MAX_FETCH_BYTES,
  fetchOptions: SafeFetchOptions = {},
): Promise<{ ok: boolean; status: number; contentType: string; bytes: Uint8Array }> {
  // safeFetch, not fetch: a 302 from an allowed image host must not reach an
  // internal address. Throws on a refused hop, like the size cap does.
  const res = await safeFetch(url, init, fetchOptions);
  const contentType = res.headers.get('content-type') || 'application/octet-stream';

  const declared = Number(res.headers.get('content-length') || '0');
  if (declared && declared > maxBytes) {
    try { await res.body?.cancel(); } catch { /* ignore */ }
    throw new Error(`Response too large: ${declared} bytes exceeds ${maxBytes}`);
  }

  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new Error(`Response too large: ${buf.length} bytes exceeds ${maxBytes}`);
    return { ok: res.ok, status: res.status, contentType, bytes: buf };
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch { /* ignore */ }
        throw new Error(`Response exceeded ${maxBytes} bytes; aborted`);
      }
      chunks.push(value);
    }
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return { ok: res.ok, status: res.status, contentType, bytes: merged };
}

function effectiveAllowlist(): string[] {
  const extra = (Deno.env.get('CRAWLER_DOMAIN_ALLOWLIST') || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...DEFAULT_CRAWL_ALLOWLIST, ...extra];
}

/**
 * True when the URL's host equals, or is a subdomain of, an allowlisted domain.
 * Honors the CRAWLER_ALLOW_ALL=true escape hatch for admin one-off crawls.
 */
export function isHostAllowed(rawUrl: string): { allowed: boolean; host?: string; reason?: string } {
  if ((Deno.env.get('CRAWLER_ALLOW_ALL') || '').toLowerCase() === 'true') {
    return { allowed: true };
  }

  let host: string;
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { allowed: false, reason: `Unsupported protocol: ${u.protocol}` };
    }
    host = u.hostname.toLowerCase();
  } catch {
    return { allowed: false, reason: 'Malformed URL' };
  }

  const allowed = effectiveAllowlist().some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );

  return allowed
    ? { allowed: true, host }
    : {
        allowed: false,
        host,
        reason:
          `Host "${host}" is not on the crawler allowlist. ` +
          `Add it via the CRAWLER_DOMAIN_ALLOWLIST secret (comma-separated) ` +
          `or set CRAWLER_ALLOW_ALL=true for a one-off crawl.`,
      };
}

/**
 * fetch() that aborts once the response body exceeds maxBytes. Reads the
 * stream incrementally so an oversized target is cut off early rather than
 * buffered whole. Returns the decoded text (capped) and the byte count read.
 */
export async function fetchTextWithSizeCap(
  url: string,
  init: RequestInit = {},
  maxBytes = DEFAULT_MAX_FETCH_BYTES,
  fetchOptions: SafeFetchOptions = {},
): Promise<{ ok: boolean; status: number; text: string; truncated: boolean; bytes: number }> {
  // Redirects are re-validated hop by hop; a refused hop throws (both callers
  // wrap this in try/catch).
  const res = await safeFetch(url, init, fetchOptions);

  // Short-circuit on an advertised Content-Length that already exceeds the cap.
  const declared = Number(res.headers.get('content-length') || '0');
  if (declared && declared > maxBytes) {
    try { await res.body?.cancel(); } catch { /* ignore */ }
    return { ok: false, status: res.status, text: '', truncated: true, bytes: declared };
  }

  if (!res.body) {
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, truncated: false, bytes: text.length };
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (total > maxBytes) {
        truncated = true;
        try { await reader.cancel(); } catch { /* ignore */ }
        break;
      }
      chunks.push(value);
    }
  }

  const merged = new Uint8Array(total > maxBytes ? maxBytes : total);
  let offset = 0;
  for (const chunk of chunks) {
    if (offset + chunk.length > merged.length) {
      merged.set(chunk.subarray(0, merged.length - offset), offset);
      break;
    }
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  const text = new TextDecoder().decode(merged);
  return { ok: res.ok && !truncated, status: res.status, text, truncated, bytes: total };
}
