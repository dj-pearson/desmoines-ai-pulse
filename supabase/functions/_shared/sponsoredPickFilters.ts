/**
 * Eligibility and copy rules for get-sponsored-pick (IOS-DD-MONETIZATION-19).
 *
 * The function used to compute "today" in UTC, so from 7pm Central a campaign
 * ending that day was already out of flight and one starting tomorrow was
 * already in. It selected sponsored events by id with no end, hidden, merged
 * or archived filter, and restaurants with no closed filter, so a paid slot
 * could send someone to last week's concert or a permanently closed kitchen.
 * And its caption said "spot locals are loving", a claim nothing measured.
 *
 * Pure so it can be tested without Deno.serve or a database.
 */

import { CENTRAL_TZ } from './centralTime.ts';

const CENTRAL_DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: CENTRAL_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's date in Des Moines, as YYYY-MM-DD (en-CA formats ISO-style). */
export function centralToday(now: Date = new Date()): string {
  return CENTRAL_DAY_FORMAT.format(now);
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** The Central calendar day a stored event date falls on, or null. */
function centralDay(value: string): string | null {
  if (DATE_ONLY.test(value)) return value;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  return CENTRAL_DAY_FORMAT.format(instant);
}

/** How long after a timed start an event with no end still counts as on. */
const STARTED_GRACE_MS = 3 * 60 * 60 * 1000;

/**
 * Whether a sponsored event is still worth sending someone to.
 *   - an end_date in the future: yes;
 *   - a later Central day: yes;
 *   - today with no time (a bare date): yes, all day;
 *   - today with a time: until three hours after it started;
 *   - anything else: no.
 */
export function isEventStillOn(
  row: { date?: string | null; end_date?: string | null },
  now: Date = new Date(),
): boolean {
  if (row.end_date) {
    const end = new Date(row.end_date);
    if (!Number.isNaN(end.getTime()) && end.getTime() >= now.getTime()) return true;
  }
  if (!row.date) return false;
  const day = centralDay(row.date);
  if (!day) return false;
  const today = centralToday(now);
  if (day > today) return true;
  if (day < today) return false;
  if (DATE_ONLY.test(row.date)) return true;
  const start = new Date(row.date).getTime();
  return start >= now.getTime() - STARTED_GRACE_MS;
}

const CLOSED_STATUSES = new Set(['closed', 'permanently_closed', 'closed_permanently']);

/** False for a restaurant Google or our own lifecycle marks closed. */
export function isRestaurantOpenForBusiness(
  row: { business_status?: string | null; status?: string | null },
): boolean {
  if ((row.business_status ?? '').toUpperCase() === 'CLOSED_PERMANENTLY') return false;
  if (CLOSED_STATUSES.has((row.status ?? '').toLowerCase())) return false;
  return true;
}

/**
 * WEB-BE-063: whether a restaurant may be promoted (the nightly social post,
 * the weekly digest). A visitor saw the nightly post feature a place that had
 * closed about six years earlier: every promotion path read the table with no
 * status check at all, and isRestaurantOpenForBusiness above only refuses a
 * place something has already marked closed. Promotion needs proof instead:
 *
 *   - Google says OPERATIONAL (NULL, CLOSED_TEMPORARILY, CLOSED_PERMANENTLY
 *     and anything else are refused: unknown is not promotable);
 *   - Places was asked within PROMOTION_MAX_CHECK_AGE_DAYS: hours_checked_at,
 *     or hours_json.fetchedAt for rows the fill mode wrote before that column;
 *   - our own status is open or newly_opened (closed spellings, opening_soon,
 *     announced and NULL are refused);
 *   - the row is not a merged-away duplicate;
 *   - nothing holds it out of promotion (promotion_hold_reason, set when
 *     Places 404s the stored place id, WEB-BE-064).
 *
 * isRestaurantPromotable and applyPromotableRestaurantFilters are the same
 * rule, one for rows in hand and one for a PostgREST read; the test holds
 * them to each other.
 */
export const PROMOTION_MAX_CHECK_AGE_DAYS = 30;

const PROMOTABLE_STATUSES = new Set(['open', 'newly_opened']);
/** Every status the CHECK allows, plus the legacy closed spellings, minus the promotable ones. */
const NOT_PROMOTABLE_STATUSES = [
  'closed',
  'permanently_closed',
  'closed_permanently',
  'opening_soon',
  'announced',
];

export type PromotionRefusal =
  | 'merged'
  | 'held'
  | 'not_operational'
  | 'status_not_open'
  | 'never_checked'
  | 'check_too_old';

export interface PromotableRestaurantRow {
  is_merged?: boolean | null;
  promotion_hold_reason?: string | null;
  business_status?: string | null;
  status?: string | null;
  hours_checked_at?: string | null;
  hours_json?: { fetchedAt?: unknown } | null;
}

/** The ISO instant before which a Places check is too old to promote on. */
export function promotionCheckCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - PROMOTION_MAX_CHECK_AGE_DAYS * 86_400_000).toISOString();
}

function lastPlacesCheck(row: PromotableRestaurantRow): string | null {
  if (typeof row.hours_checked_at === 'string' && row.hours_checked_at) return row.hours_checked_at;
  // Mirrors the SQL arm: fetchedAt stands in only when hours_checked_at is NULL.
  if (row.hours_checked_at == null) {
    const fetched = row.hours_json?.fetchedAt;
    if (typeof fetched === 'string' && fetched) return fetched;
  }
  return null;
}

/** Why a restaurant may not be promoted, or null when it may. */
export function restaurantPromotionRefusal(
  row: PromotableRestaurantRow,
  now: Date = new Date(),
): PromotionRefusal | null {
  if (row.is_merged === true) return 'merged';
  if (row.promotion_hold_reason) return 'held';
  if (row.business_status !== 'OPERATIONAL') return 'not_operational';
  if (!PROMOTABLE_STATUSES.has(row.status ?? '')) return 'status_not_open';
  const checked = lastPlacesCheck(row);
  if (!checked) return 'never_checked';
  // ISO-8601 UTC strings order as text, the comparison the SQL filter makes.
  if (checked < promotionCheckCutoff(now)) return 'check_too_old';
  return null;
}

export function isRestaurantPromotable(row: PromotableRestaurantRow, now: Date = new Date()): boolean {
  return restaurantPromotionRefusal(row, now) === null;
}

/** The slice of the postgrest-js filter builder the promotion reads use. */
export interface PromotableFilterBuilder<Q> {
  eq(column: string, value: string): Q;
  is(column: string, value: null): Q;
  not(column: string, operator: string, value: unknown): Q;
  or(filters: string): Q;
}

/**
 * The PostgREST form of isRestaurantPromotable. `status NOT IN (...)` also
 * drops a NULL status, as the predicate does.
 */
export function applyPromotableRestaurantFilters<Q extends PromotableFilterBuilder<Q>>(
  q: Q,
  now: Date = new Date(),
): Q {
  const cutoff = promotionCheckCutoff(now);
  return q
    .not('is_merged', 'is', true)
    .is('promotion_hold_reason', null)
    .eq('business_status', 'OPERATIONAL')
    .not('status', 'in', `(${NOT_PROMOTABLE_STATUSES.join(',')})`)
    .or(`hours_checked_at.gte.${cutoff},and(hours_checked_at.is.null,hours_json->>fetchedAt.gte.${cutoff})`);
}

function titleCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

/**
 * The caption under a sponsored pick. Says what it is and nothing it cannot
 * back up: no "locals are loving", no "worth a look".
 */
export function buildReason(
  type: 'event' | 'restaurant',
  category: string | null | undefined,
): string {
  const label = typeof category === 'string' && category.trim() ? titleCase(category) : '';
  if (type === 'event') {
    return label ? `Sponsored · ${label} event` : 'Sponsored event';
  }
  return label ? `Sponsored · ${label}` : 'Sponsored restaurant';
}
