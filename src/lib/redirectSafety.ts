/**
 * Open-redirect validation, with no dependencies (WEB-PERF-020).
 *
 * WHY IT IS ITS OWN FILE. AuthContext is on the critical path and used exactly
 * one member of SecurityUtils - isValidRedirectUrl - but importing the class
 * pulled in all of src/lib/securityUtils.ts, which imports zod and dompurify.
 * Measured in the production entry chunk: zod 130.1 KB rendered (10.5%),
 * dompurify 119.0 KB (9.6%). One call to a twenty-line pure function was
 * costing 20% of the first paint.
 *
 * Nothing here may import anything. That is the whole point of the file, and it
 * is the kind of constraint that erodes one convenient import at a time.
 *
 * STRUCTURE, NOT A PATTERN LIST (account plan WP2 item 1). The old version
 * rejected any ':' and any '%' in the first segment anywhere in the value, so
 * `/events?q=jazz%20night`, `/events/abc?time=19:00` and
 * `/restaurants?cuisine=a%26b` all came back as '/'. Someone who signed up from
 * a search result landed on the home page. The rules now apply to the part of
 * the value that decides where the browser goes (the path); the query string
 * and fragment only have to be well-formed, and when they are not, the path
 * survives on its own instead of the whole value being thrown away.
 */

/**
 * A fixed origin to resolve against. Any value that resolves somewhere else is
 * absolute or protocol-relative, whatever tricks it used to look relative.
 * Deliberately not window.location, so the answer is the same in a unit test,
 * a worker and the browser.
 */
const BASE_ORIGIN = 'https://redirect-check.invalid';

/** C0 controls, DEL and the C1 range. URL parsers strip some of these silently. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

/** A scheme at the start of a value: `javascript:`, `data:`, `https:`. */
const LEADING_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * The path part of a trimmed, same-origin-looking value, judged strictly.
 * Returns the parsed URL when the path is acceptable, otherwise null.
 */
function parsePath(rawPath: string): URL | null {
  // Colons and backslashes never appear in a route of ours, and both are how
  // a path is made to look like a scheme or a host to some parser.
  if (rawPath.includes(':') || rawPath.includes('\\')) return null;

  const decoded = safeDecode(rawPath);
  if (decoded === null) return null;
  if (decoded.startsWith('//') || decoded.startsWith('/\\')) return null;
  if (decoded.includes(':') || decoded.includes('\\')) return null;

  // `/@evil.com` and `/user@host`: harmless to the router, but it is the shape
  // of a userinfo trick and no route of ours has an @ in its first segment.
  const firstSegment = decoded.split('/')[1] ?? '';
  if (firstSegment.includes('@')) return null;

  let url: URL;
  try {
    url = new URL(rawPath, BASE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== BASE_ORIGIN) return null;
  return url;
}

interface RedirectVerdict {
  /** The whole value (path, query and fragment) is acceptable. */
  whole: string | null;
  /** The path alone is acceptable. */
  pathOnly: string | null;
}

function judge(url: string | null | undefined): RedirectVerdict {
  const none: RedirectVerdict = { whole: null, pathOnly: null };
  if (!url || typeof url !== 'string') return none;

  const trimmed = url.trim();
  if (!trimmed.startsWith('/')) return none;
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return none;
  if (LEADING_SCHEME.test(trimmed)) return none;
  if (CONTROL_CHARS.test(trimmed)) return none;

  const cut = trimmed.search(/[?#]/);
  const rawPath = cut === -1 ? trimmed : trimmed.slice(0, cut);
  const rawRest = cut === -1 ? '' : trimmed.slice(cut);

  const pathUrl = parsePath(rawPath);
  if (!pathUrl) return none;
  const pathOnly = pathUrl.pathname;

  if (!rawRest) return { whole: pathOnly, pathOnly };

  // The query and fragment only have to decode. They are data for the page,
  // not a destination, so a colon in `?time=19:00` is fine.
  if (safeDecode(rawRest) === null) return { whole: null, pathOnly };

  let full: URL;
  try {
    full = new URL(rawPath + rawRest, BASE_ORIGIN);
  } catch {
    return { whole: null, pathOnly };
  }
  if (full.origin !== BASE_ORIGIN || full.pathname !== pathOnly) {
    return { whole: null, pathOnly };
  }
  return { whole: full.pathname + full.search + full.hash, pathOnly };
}

/**
 * True only for a same-origin relative path whose query and fragment are also
 * well-formed.
 *
 * MALFORMED INPUT RETURNS FALSE RATHER THAN THROWING. `decodeURIComponent('/%')`
 * raises a URIError; an earlier version decoded before checking and threw, which
 * surfaced in AuthContext's OAuth try/catch as "Failed to sign in with Google".
 * A validator whose job is to answer yes or no must not have a third outcome.
 */
export function isValidRedirectUrl(url: string | null | undefined): boolean {
  return judge(url).whole !== null;
}

/**
 * The validated path (with its query and fragment when those are well-formed),
 * or the fallback. When only the query or fragment is broken, the path is kept:
 * `/events?q=%E0` returns `/events`, not the fallback.
 *
 * Never returns the caller's value unless it passed, and returns it in the
 * normalised form the URL parser produced.
 */
export function getSafeRedirectUrl(url: string | null | undefined, defaultUrl = '/'): string {
  const verdict = judge(url);
  return verdict.whole ?? verdict.pathOnly ?? defaultUrl;
}
