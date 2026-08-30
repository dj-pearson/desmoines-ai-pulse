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

/**
 * fetch() that returns binary bytes but aborts once the body exceeds maxBytes,
 * reading the stream incrementally so an oversized target is cut off early.
 * Rejects if the cap is exceeded so callers never serve a truncated image.
 */
export async function fetchArrayBufferWithSizeCap(
  url: string,
  init: RequestInit = {},
  maxBytes = DEFAULT_MAX_FETCH_BYTES,
): Promise<{ ok: boolean; status: number; contentType: string; bytes: Uint8Array }> {
  const res = await fetch(url, init);
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
): Promise<{ ok: boolean; status: number; text: string; truncated: boolean; bytes: number }> {
  const res = await fetch(url, init);

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
