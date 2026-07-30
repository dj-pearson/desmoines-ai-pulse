/**
 * URL admission control for the menu scraper.
 *
 * `restaurants.menu_url` and `restaurants.website` are admin-editable free
 * text, and `scrape-restaurant-menus` runs with `verify_jwt = false` and the
 * service role key. Nothing downstream re-validates those values, so this is
 * the one place that decides whether a URL may be fetched at all — a typo'd or
 * hostile value must not be able to make the function reach into the cluster's
 * private network.
 */

/** Loopback, link-local, RFC1918 and internal-only TLDs. */
const PRIVATE_HOST_RE = new RegExp(
  [
    "^localhost$",
    "^127\\.",
    "^10\\.",
    "^192\\.168\\.",
    "^169\\.254\\.",
    "^172\\.(?:1[6-9]|2\\d|3[01])\\.",
    "^0\\.",
    "^\\[?::1\\]?$",
    "^\\[?fc[0-9a-f]{2}:",
    "^\\[?fd[0-9a-f]{2}:",
    "\\.local$",
    "\\.internal$",
    "\\.localhost$",
  ].join("|"),
  "i",
);

/** True only for a public http(s) URL that is safe to fetch. */
export function isPublicHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false; // credentials-in-URL
  const host = url.hostname.toLowerCase();
  if (!host) return false;
  return !PRIVATE_HOST_RE.test(host);
}

/**
 * Clean a stored site URL: add a scheme when the admin typed a bare domain,
 * drop the trailing slash, and reject anything not safe to fetch.
 *
 * Returns null rather than throwing, so one bad row never fails a batch.
 */
export function normalizeSiteUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (!isPublicHttpUrl(withScheme)) return null;
  return withScheme.replace(/\/+$/, "");
}
