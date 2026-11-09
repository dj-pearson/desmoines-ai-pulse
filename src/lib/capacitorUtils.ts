/**
 * External link and share helpers.
 *
 * The file name is historical: it held the Capacitor shell's platform
 * detection and plugin bridge until WEB-FEAT-039 removed them. The native apps
 * are SwiftUI and Kotlin, nothing defines window.Capacitor, and every branch
 * on it was code that could not run. What is left is web-only.
 */

import { createLogger } from '@/lib/logger';

const logger = createLogger('capacitorUtils');

/* ------------------------------------------------------------------ */
/* External link helper                                               */
/* ------------------------------------------------------------------ */

/**
 * Returns the URL normalised by the URL parser when its scheme is http: or
 * https:, otherwise null.
 *
 * Every external link on the site ultimately comes from a scraper
 * (`events.source_url`) or an advertiser (`campaign_creatives.link_url`), so
 * neither can be trusted to hold a web URL. `javascript:`, `data:`, `file:`,
 * `intent:` and friends are refused here, in one place, rather than at each
 * call site. Relative URLs are refused too: an "external" link that resolves
 * against our own origin is a data error, not a link.
 */
export function toSafeExternalUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed.href;
}

/**
 * Opens a URL in a new tab, without an opener.
 *
 * Refuses anything that is not an absolute http(s) URL (see
 * `toSafeExternalUrl`) and returns false without opening anything.
 * Otherwise returns true to say the open was attempted.
 */
export async function openExternalUrl(url: string): Promise<boolean> {
  const safeUrl = toSafeExternalUrl(url);
  if (!safeUrl) {
    logger.warn('openExternalUrl', 'Refused non-http(s) URL');
    return false;
  }

  window.open(safeUrl, '_blank', 'noopener,noreferrer');
  return true;
}

/* ------------------------------------------------------------------ */
/* Share helper                                                       */
/* ------------------------------------------------------------------ */

export type ShareOutcome = 'shared' | 'cancelled' | 'unavailable';

/** True when a share rejection means the person closed the sheet. */
function isShareCancel(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  const message = String((err as { message?: unknown } | null)?.message ?? err ?? '');
  return /cancel/i.test(message);
}

/**
 * Web Share with the outcome spelled out. A plain true/false answers the same
 * for a cancel and for "no share sheet here", so a caller that falls back to
 * the clipboard overwrote whatever the person had copied after they chose not
 * to share. 'cancelled' is the person's answer and needs no fallback;
 * 'unavailable' (no sheet, or it failed) does.
 */
export async function shareWithOutcome(opts: {
  title?: string;
  text?: string;
  url?: string;
}): Promise<ShareOutcome> {
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share(opts);
      return 'shared';
    }
  } catch (err) {
    if (isShareCancel(err)) return 'cancelled';
    logger.warn('shareWithOutcome', 'share failed', { error: String(err) });
  }
  return 'unavailable';
}
