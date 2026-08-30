/**
 * IndexNow submission (WEB-SEO-011).
 *
 * WHY THIS REPLACES THE OLD PING. regenerate-sitemaps used to "ping search
 * engines" on every run. Both endpoints it called are dead — probed 2026-08-11:
 *
 *   GET https://www.google.com/ping?sitemap=… → 404 "Sitemaps ping is deprecated"
 *   GET https://www.bing.com/ping?sitemap=…   → 410 Gone
 *
 * The job had been calling them every 6 hours and writing {google: 404,
 * bing: 410} into its own metadata as if that were a result. IndexNow is the
 * replacement Bing (and Yandex, Naver, Seznam) point to. Google never shipped a
 * replacement and asks publishers to rely on accurate sitemap `lastmod`, which
 * the same job already regenerates — so Google is covered by the sitemap half
 * of this function, not by anything here.
 *
 * THE KEY BELOW IS NOT A SECRET. IndexNow authorizes a submission by requiring
 * the key to be publicly readable at https://<host>/<key>.txt, so the value is
 * committed precisely so Cloudflare Pages can serve it from public/. Knowing it
 * grants exactly one capability — asking Bing to recrawl a URL on our own host,
 * which anyone who fetches the key file can already do. Do not move it into a
 * secret store: the edge function and the static file have to agree on it, and
 * splitting one public value across two config surfaces is how they would
 * silently drift into 403s nobody notices.
 *
 * src/lib/__tests__/indexNowKey.test.ts asserts the file and this constant stay
 * in sync.
 */
import { fetchWithTimeout } from "./fetchWithTimeout.ts";

export const INDEXNOW_KEY = "c2d7b3a0ed753ae68b306e25422227ff";

/** Served from public/ — must sit at the host root for a root-scoped key. */
export const INDEXNOW_KEY_FILE = `${INDEXNOW_KEY}.txt`;

/** Any participating endpoint forwards to the rest; api.indexnow.org is the neutral one. */
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/** Protocol cap: 10,000 URLs per request. */
export const INDEXNOW_MAX_URLS = 10_000;

export interface IndexNowPayload {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

export interface BuiltPayload {
  payload: IndexNowPayload | null;
  /** URLs rejected before submission, with the reason they were rejected. */
  dropped: string[];
  /** Count discarded by the 10,000-URL cap. */
  truncated: number;
  /** Set when payload is null. */
  reason?: string;
}

/**
 * Build a spec-valid IndexNow payload, or null when there is nothing to send.
 *
 * The filtering is not defensive padding. IndexNow rejects the ENTIRE batch
 * with 422 if a single URL is not on the declared host, so one stray absolute
 * URL from another domain would silently cost us every other URL in the run.
 * Drop the offenders and report them instead.
 */
export function buildIndexNowPayload(
  siteUrl: string,
  urls: string[],
  key: string = INDEXNOW_KEY,
): BuiltPayload {
  let origin: URL;
  try {
    origin = new URL(siteUrl);
  } catch {
    return { payload: null, dropped: [], truncated: 0, reason: "bad_site_url" };
  }

  const host = origin.hostname.toLowerCase();
  const dropped: string[] = [];
  const seen = new Set<string>();

  for (const raw of urls) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      dropped.push(raw);
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      dropped.push(raw);
      continue;
    }
    if (parsed.hostname.toLowerCase() !== host) {
      dropped.push(raw);
      continue;
    }
    seen.add(parsed.toString());
  }

  const all = [...seen];
  const urlList = all.slice(0, INDEXNOW_MAX_URLS);
  const truncated = all.length - urlList.length;

  if (urlList.length === 0) {
    return { payload: null, dropped, truncated, reason: "no_urls" };
  }

  return {
    payload: {
      host,
      key,
      keyLocation: `${origin.protocol}//${origin.host}/${key}.txt`,
      urlList,
    },
    dropped,
    truncated,
  };
}

/**
 * IndexNow's status codes are the only diagnosis available when a submission
 * fails — there is no response body. Spell them out so a bad key shows up in
 * job metadata as a bad key rather than as the number 403.
 */
export function describeIndexNowStatus(status: number): string {
  switch (status) {
    case 200: return "accepted";
    case 202: return "accepted; key validation pending";
    case 400: return "bad request — malformed payload";
    case 403: return `forbidden — key not found or wrong contents at /${INDEXNOW_KEY_FILE}`;
    case 422: return "unprocessable — a URL does not belong to the declared host, or the key does not match";
    case 429: return "rate limited — too many requests";
    default: return `unexpected status ${status}`;
  }
}

/**
 * Submit changed URLs to IndexNow. Best-effort by design: this runs inside the
 * sitemap regeneration job, and a search-engine notification failing must never
 * cost us the sitemap write that already succeeded. Never throws.
 */
export async function submitToIndexNow(
  siteUrl: string,
  urls: string[],
): Promise<Record<string, unknown>> {
  const { payload, dropped, truncated, reason } = buildIndexNowPayload(siteUrl, urls);
  if (!payload) return { skipped: true, reason, dropped: dropped.length };

  try {
    const res = await fetchWithTimeout(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });
    return {
      submitted: payload.urlList.length,
      dropped: dropped.length,
      truncated,
      status: res.status,
      detail: describeIndexNowStatus(res.status),
      ok: res.status === 200 || res.status === 202,
    };
  } catch (err) {
    return {
      submitted: 0,
      dropped: dropped.length,
      truncated,
      error: err instanceof Error ? err.message : String(err),
      ok: false,
    };
  }
}
