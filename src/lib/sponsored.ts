/**
 * Sponsored-listing helpers (WEB-FEAT-005). A listing is only "actively"
 * sponsored while `is_sponsored` is set AND `sponsored_until` hasn't passed, so
 * expired sponsorships drop their boost/badge automatically with no cleanup.
 */
export interface SponsorableItem {
  is_sponsored?: boolean | null;
  sponsored_until?: string | null;
}

export function isActivelySponsored(item: SponsorableItem | null | undefined): boolean {
  if (!item?.is_sponsored) return false;
  if (!item.sponsored_until) return true; // sponsored with no expiry
  const until = new Date(item.sponsored_until).getTime();
  return Number.isFinite(until) ? until > Date.now() : true;
}

/**
 * Move up to `cap` actively-sponsored items to the front (clearly labeled, never
 * disguised), leaving the organic order otherwise untouched. Extra sponsored
 * items past the cap stay in their organic positions.
 */
export function arrangeSponsoredFirst<T extends SponsorableItem>(items: T[], cap = 2): T[] {
  if (!Array.isArray(items) || items.length === 0) return items;
  const sponsored: T[] = [];
  const organic: T[] = [];
  for (const item of items) {
    if (sponsored.length < cap && isActivelySponsored(item)) sponsored.push(item);
    else organic.push(item);
  }
  return sponsored.length > 0 ? [...sponsored, ...organic] : items;
}
