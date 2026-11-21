/**
 * WEB-BE-064: closure detection for restaurants the daily refresh never read.
 *
 * Pure, no remote imports, so placeLookup.test.ts runs offline.
 *
 * Three gaps let a closed listing stay live:
 *   1. the stale refresh selected only rows with stored hours, so a row with a
 *      place id and no hours was never re-read (staleHoursFilter in
 *      placeHours.ts now includes never-checked rows);
 *   2. a Places 404 stamped hours_checked_at and left the row looking
 *      verified; it is now a finding in restaurant_closure_reviews and holds
 *      the row out of promotion (promotion_hold_reason);
 *   3. a row with no google_place_id was checked by nothing. The lookup mode
 *      here searches Places by name and address and stores the id only on a
 *      confident match.
 *
 * A wrong place id is worse than none: the refresh would then report another
 * business's hours and status as this one's. So the match refuses rather than
 * guesses, the rule findKnownVenue follows: the normalised names must be
 * equal, the address must agree, and exactly one candidate may pass.
 */

export type ClosureReviewReason = 'place_not_found' | 'no_place_match' | 'visitor_report';

export interface ClosureReviewRow {
  restaurant_id: string;
  reason: ClosureReviewReason;
  source: string;
  details: Record<string, unknown>;
}

export function buildClosureReview(
  restaurantId: string,
  reason: ClosureReviewReason,
  source: string,
  details: Record<string, unknown> = {},
): ClosureReviewRow {
  return { restaurant_id: restaurantId, reason, source, details };
}

/**
 * The Text Search field mask the lookup sends. id, displayName and
 * formattedAddress bill at the Text Search Pro SKU; nothing from the
 * Enterprise tier (hours, rating, phone) is asked for, since the stale refresh
 * reads those once the id is stored.
 */
export const PLACE_LOOKUP_FIELD_MASK = 'places.id,places.displayName,places.formattedAddress';

/** Daily cap on lookups (owner decision 2026-11-21: 25 a day). */
export const PLACE_LOOKUP_DAILY_MAX = 25;

const NAME_NOISE = new Set(['the', 'restaurant', 'and']);

/**
 * Lowercased, accents and punctuation removed, "&" read as "and", and the
 * words "the", "restaurant" and "and" dropped, so "The Cheese Shop & Cafe"
 * and "Cheese Shop and Cafe" compare equal. Nothing else is stripped: "Bar"
 * and "Grill" often tell two businesses apart.
 */
export function normalizePlaceName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !NAME_NOISE.has(w))
    .join(' ');
}

/** The leading street number in an address, or null. */
export function streetNumber(address: string | null | undefined): string | null {
  const m = (address ?? '').trim().match(/^(\d+[a-z]?)\b/i);
  return m ? m[1].toLowerCase() : null;
}

export interface PlaceCandidate {
  id?: string;
  displayName?: { text?: string } | null;
  formattedAddress?: string | null;
}

export interface LookupRow {
  id: string;
  name: string;
  location?: string | null;
}

export type PlaceMatch =
  | { ok: true; placeId: string }
  | { ok: false; reason: 'no_candidates' | 'no_name_match' | 'address_mismatch' | 'ambiguous' };

/**
 * One candidate passes when its normalised name equals the row's, its address
 * is in Iowa, and, when the row's location starts with a street number, the
 * candidate's address starts with the same number. More than one passing
 * candidate is refused as ambiguous (two branches of a chain).
 */
export function pickConfidentPlace(row: LookupRow, candidates: PlaceCandidate[]): PlaceMatch {
  if (candidates.length === 0) return { ok: false, reason: 'no_candidates' };
  const want = normalizePlaceName(row.name);
  if (!want) return { ok: false, reason: 'no_name_match' };
  const named = candidates.filter(
    (c) => typeof c.id === 'string' && c.id && normalizePlaceName(c.displayName?.text ?? '') === want,
  );
  if (named.length === 0) return { ok: false, reason: 'no_name_match' };
  const number = streetNumber(row.location);
  const located = named.filter((c) => {
    const address = c.formattedAddress ?? '';
    if (!/,\s*IA\b/.test(address)) return false;
    return number === null || streetNumber(address) === number;
  });
  if (located.length === 0) return { ok: false, reason: 'address_mismatch' };
  if (located.length > 1) return { ok: false, reason: 'ambiguous' };
  return { ok: true, placeId: located[0].id as string };
}

/** The Text Search query for a row: its name and, when known, its address. */
export function placeLookupQuery(row: LookupRow): string {
  const location = (row.location ?? '').trim();
  return location ? `${row.name}, ${location}` : `${row.name}, Des Moines, IA`;
}
