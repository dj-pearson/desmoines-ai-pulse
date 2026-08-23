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
 */

/**
 * True only for a same-origin relative path.
 *
 * MALFORMED INPUT RETURNS FALSE RATHER THAN THROWING, which the original did
 * not. `decodeURIComponent('/%')` raises a URIError, and the decode ran before
 * the pattern checks that would have rejected it, so isValidRedirectUrl('/%')
 * threw instead of returning false. Both callers sit inside a try/catch in
 * AuthContext's OAuth paths, so the throw surfaced as "Failed to sign in with
 * Google" - a user arriving with a malformed ?redirectTo could not sign in at
 * all, and the message blamed the provider. A validator whose job is to answer
 * yes or no must not have a third outcome.
 */
export function isValidRedirectUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const trimmedUrl = url.trim();

  // Must start with a single forward slash (relative path).
  // Blocks protocol-relative URLs (//evil.com) and absolute URLs.
  if (!trimmedUrl.startsWith('/') || trimmedUrl.startsWith('//')) {
    return false;
  }

  // Block URLs containing protocol indicators
  if (trimmedUrl.includes(':')) {
    return false;
  }

  // Block encoded characters that could bypass validation - URL-encoded
  // slashes, colons and similar. An undecodable string is rejected, not
  // decoded: it cannot be proven safe, and it is not a URL anybody meant.
  let decoded: string;
  try {
    decoded = decodeURIComponent(trimmedUrl);
  } catch {
    return false;
  }
  if (decoded.startsWith('//') || decoded.includes(':')) {
    return false;
  }

  // Block common bypass patterns
  const bypassPatterns = [
    /^\/\\/i, // /\evil.com
    /^\/[^/]*@/i, // /@evil.com
    /^\/[^/]*%/i, // /%2F pattern at start
    /javascript:/i, // javascript: protocol
    /data:/i, // data: protocol
    /vbscript:/i, // vbscript: protocol
  ];

  if (bypassPatterns.some((pattern) => pattern.test(trimmedUrl))) {
    return false;
  }

  return true;
}

/**
 * The validated URL, or the fallback. Never returns the caller's value unless
 * it passed.
 */
export function getSafeRedirectUrl(url: string | null | undefined, defaultUrl = '/'): string {
  return isValidRedirectUrl(url) ? (url as string) : defaultUrl;
}
