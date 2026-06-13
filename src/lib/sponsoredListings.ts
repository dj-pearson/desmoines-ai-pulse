/**
 * Sponsored/featured listing helpers (WEB-FEAT-005 — web twin of iOS IOS-ADS-011).
 *
 * A sponsored listing is organic content (an event/restaurant/attraction) that an
 * advertiser has paid to boost in browse lists. It is NEVER disguised: every
 * sponsored card carries a clear "Sponsored" badge + amber ring. Sponsorships
 * expire automatically via `sponsored_until` so no manual cleanup is required.
 */

/** Cap on how many sponsored items float to the top of a browse list. Mirrors
 *  iOS `AdConfig.maxSponsoredAtFront`. */
export const MAX_SPONSORED_AT_FRONT = 2;

/** Inventory class tag for sponsored-listing impression/click analytics. */
export const SPONSORED_LISTING_INVENTORY = 'sponsored_listing';

export interface SponsorableItem {
  is_sponsored?: boolean | null;
  sponsored_until?: string | null;
}

/**
 * True only when the item is flagged sponsored AND the paid window has not
 * lapsed. An absent `sponsored_until` means an open-ended sponsorship; an
 * unparseable value fails toward labeling (treated as active) so we never
 * accidentally hide a disclosure.
 */
export function isActivelySponsored(
  item: SponsorableItem | null | undefined,
): boolean {
  if (!item || item.is_sponsored !== true) return false;
  if (!item.sponsored_until) return true;
  const until = new Date(item.sponsored_until).getTime();
  if (Number.isNaN(until)) return true;
  return until > Date.now();
}

/**
 * Move up to `max` actively-sponsored items to the front of the list, preserving
 * their relative order; the organic order of every other item is untouched.
 * Items flagged sponsored beyond the cap (or with an expired window) keep their
 * organic position. Returns the original array reference when nothing changes so
 * memoized consumers don't re-render needlessly.
 */
export function promoteSponsored<T extends SponsorableItem>(
  items: T[],
  max: number = MAX_SPONSORED_AT_FRONT,
): T[] {
  if (!items || items.length === 0) return items;
  const sponsored: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    if (sponsored.length < max && isActivelySponsored(item)) {
      sponsored.push(item);
    } else {
      rest.push(item);
    }
  }
  if (sponsored.length === 0) return items;
  // Already front-loaded? Keep identity (every promoted item is a prefix).
  if (items.slice(0, sponsored.length).every((it, i) => it === sponsored[i])) {
    return items;
  }
  return [...sponsored, ...rest];
}
