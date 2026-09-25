/**
 * The one answer to "can this stored text go in an href?".
 *
 * Restaurant `website`, `menu_url`, `reservation_url` and friends are scraped
 * or typed text, not links we built. A `javascript:` value in one of them used
 * to render as a clickable link in the crawler shell (functions/_middleware.ts)
 * while the React page refused it, because each side had its own check.
 *
 * NO IMPORTS, and relative imports only if one is ever added: the Pages
 * middleware bundles this file by relative path, and that bundler does not
 * read the app's "@/" alias (same rule as restaurantMeta.ts).
 */

/** A scheme at the start of the string: "https:", "javascript:", "tel:". */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
/** A bare hostname with at least one dot, optionally followed by a path. */
const BARE_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+(?::\d+)?(?:[/?#]|$)/i;

/**
 * An absolute http(s) URL, or null.
 *
 * A bare "www.x.com" gets `https://` in front, so it becomes a working link
 * instead of a path that resolves against our own origin. Anything with
 * another scheme, a relative path, or text that doesn't parse is null, and
 * callers render no link for null.
 */
export function safeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = !HAS_SCHEME.test(trimmed) && BARE_HOST.test(trimmed) ? `https://${trimmed}` : trimmed;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed.href;
}
