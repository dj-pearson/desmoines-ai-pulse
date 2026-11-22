/**
 * How old a captured menu may be before this site stops publishing its prices
 * (WEB-BE-071). One rule for the page and the JSON-LD, so a menu the page has
 * collapsed as out of date is never still advertised to search engines with
 * Offer prices.
 *
 * The weekly refresh re-scrapes menus past 30 days, so a menu reaches 180 only
 * when the restaurant's site has stopped yielding a menu for months.
 */
export const MENU_STALE_AFTER_DAYS = 180;

const MS_PER_DAY = 86_400_000;

/** Whole days since capture, or null when the date cannot be read. */
export function menuAgeDays(capturedAt: string | null | undefined, now: Date = new Date()): number | null {
  if (!capturedAt) return null;
  const captured = new Date(capturedAt).getTime();
  if (Number.isNaN(captured)) return null;
  return Math.floor((now.getTime() - captured) / MS_PER_DAY);
}

/**
 * True when the menu is older than MENU_STALE_AFTER_DAYS. A menu whose capture
 * date is missing or unreadable counts as stale: with no date there is nothing
 * to vouch for its prices.
 */
export function isMenuStale(capturedAt: string | null | undefined, now: Date = new Date()): boolean {
  const age = menuAgeDays(capturedAt, now);
  return age === null || age > MENU_STALE_AFTER_DAYS;
}
