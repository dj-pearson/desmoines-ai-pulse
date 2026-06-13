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
  'hoyt-sherman.org',
  'valairdmoines.com',
  'wooly.us',
  'eventbrite.com',
  'milb.com',
  'iowacubs.com',
  'theiowabarnstormers.com',
  'iowawild.com',
  'gleague.nba.com',
  'seatgeek.com',
  'ticketmaster.com',
  'axs.com',
];

/** Max bytes to read from a single direct fetch (default 10 MB). */
export const DEFAULT_MAX_FETCH_BYTES = 10 * 1024 * 1024;

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
