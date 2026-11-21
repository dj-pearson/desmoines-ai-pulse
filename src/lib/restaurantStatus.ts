/**
 * Restaurant lifecycle status and the open-status result shape, with no
 * imports (WEB-PERF-080).
 *
 * Most pages that touch restaurants only filter them by status: a PostgREST
 * filter constant, isVisitableStatus, isPermanentlyClosedRestaurant, the
 * Central time-zone name, or formatOpenStatusLine over a result someone else
 * computed. Those names used to live in restaurantHours.ts beside the
 * free-text hours parser and date-fns-tz, so every such page downloaded the
 * parser too. restaurantHours.ts re-exports everything here, so old imports
 * keep working; a module that needs only these names imports this file.
 *
 * Keep it import-free. restaurantStatusSplit.test.ts fails if it grows one.
 */

export type OpenStatus = 'open' | 'closed' | 'closing-soon' | 'unknown';

export interface RestaurantOpenResult {
  status: OpenStatus;
  isOpen: boolean;
  closingSoon: boolean;
  /** When open: the Central closing time, "10 PM" / "10:30 PM" / "midnight". Null when open around the clock or not open. */
  closesAt: string | null;
  /** When closed: the next Central opening, "11 AM", "tomorrow 11 AM" or "Tue 11 AM". Null when unknown or never. */
  nextOpensAt: string | null;
  /** Minutes until `nextOpensAt`, for ordering "opening next" lists. Null alongside it. */
  nextOpensInMinutes: number | null;
}

export const DES_MOINES_TIME_ZONE = 'America/Chicago';

/**
 * The CHECK on restaurants.status (20250728165446) allows open, newly_opened,
 * opening_soon, announced and closed. The last three mean you cannot eat
 * there today. The legacy spellings are for rows written before the CHECK,
 * and for code that still says them.
 */
const NOT_VISITABLE_STATUSES: ReadonlySet<string> = new Set([
  'closed',
  'opening_soon',
  'announced',
  'permanently_closed',
  'temporarily_closed',
  'closed_permanently',
  'closed_temporarily',
  'coming_soon',
]);

/**
 * Can someone eat here today, going by the lifecycle status alone? True for
 * open, newly_opened and a missing status (the column defaults to open).
 * The one rule for Surprise Me, open-now, the map and search ordering (WP2.4).
 */
export function isVisitableStatus(status: string | null | undefined): boolean {
  if (!status) return true;
  return !NOT_VISITABLE_STATUSES.has(status.trim().toLowerCase());
}

const PERMANENTLY_CLOSED_STATUSES: ReadonlySet<string> = new Set([
  'closed',
  'permanently_closed',
  'closed_permanently',
]);

/**
 * Has this place closed for good (SEO-059)? Our own `status` or Google's
 * `business_status`, whichever says so. Temporarily closed and not-yet-open
 * places are NOT permanently closed: they keep their page and their spot in
 * lists, labelled.
 */
export function isPermanentlyClosedRestaurant(
  row: { status?: string | null; business_status?: string | null } | null | undefined,
): boolean {
  if (!row) return false;
  const own = row.status?.trim().toLowerCase();
  if (own && PERMANENTLY_CLOSED_STATUSES.has(own)) return true;
  return row.business_status?.trim().toUpperCase() === 'CLOSED_PERMANENTLY';
}

/**
 * Is this place's door shut: closed for good, or closed for now (our own
 * `temporarily_closed` or Google's CLOSED_TEMPORARILY)? The same line the
 * restaurant page draws before it lists deals (WEB-FEAT-036). A place that
 * has not opened yet is NOT shut here: a grand-opening offer is still an
 * offer, which is where this differs from isServingToday.
 */
export function isShutRestaurant(
  row: { status?: string | null; business_status?: string | null } | null | undefined,
): boolean {
  if (!row) return false;
  if (isPermanentlyClosedRestaurant(row)) return true;
  if (row.status?.trim().toLowerCase() === 'temporarily_closed') return true;
  return row.business_status?.trim().toUpperCase() === 'CLOSED_TEMPORARILY';
}

/**
 * Google's business_status values that mean nobody is serving there today.
 * The CHECK on restaurants.status has no temporarily-closed value, so a
 * temporary closure is recorded ONLY here, and Google keeps publishing the
 * regular weekly hours of a temporarily closed place.
 */
const NOT_SERVING_BUSINESS_STATUSES: ReadonlySet<string> = new Set([
  'CLOSED_TEMPORARILY',
  'CLOSED_PERMANENTLY',
]);

/**
 * Can someone eat here today? isVisitableStatus plus Google's business_status.
 * Every surface that prints "Open now" or "open until 10 PM" from hours has to
 * ask this rather than isVisitableStatus alone: hours_json still says open on
 * a CLOSED_TEMPORARILY row, and the evaluator would believe it.
 */
export function isServingToday(
  row: { status?: string | null; business_status?: string | null } | null | undefined,
): boolean {
  if (!row) return false;
  if (!isVisitableStatus(row.status)) return false;
  const google = row.business_status?.trim().toUpperCase();
  return !google || !NOT_SERVING_BUSINESS_STATUSES.has(google);
}

/**
 * The card label for Google's business_status, or undefined when it says
 * nothing that overrides the hours.
 */
export function businessStatusLabel(businessStatus: string | null | undefined): string | undefined {
  switch (businessStatus?.trim().toUpperCase()) {
    case 'CLOSED_PERMANENTLY':
      return 'Permanently closed';
    case 'CLOSED_TEMPORARILY':
      return 'Temporarily closed';
    default:
      return undefined;
  }
}

/**
 * PostgREST `or` filter that keeps every restaurant that has not closed for
 * good. status is nullable and `.neq('status','closed')` would also drop the
 * NULL rows, hence the OR. Repeated `or` params are ANDed by PostgREST
 * (checked against production 2026-10-01), so this can sit beside another
 * `.or(...)` on the same query. Google's business_status is not in it: the
 * SEO-059 data pass set status = 'closed' on every CLOSED_PERMANENTLY row, and
 * isPermanentlyClosedRestaurant catches any that arrive later on the client.
 */
export const NOT_CLOSED_RESTAURANT_FILTER = 'status.is.null,status.neq.closed';

/**
 * PostgREST `or` filter that leaves out a place Google calls
 * CLOSED_PERMANENTLY. The SEO-059 data pass set status = 'closed' on the rows
 * it found, but the daily hours refresh (WEB-FEAT-079) writes business_status
 * and never status, so a place that closes after that pass is caught only by
 * this. business_status is stored upper case (normalizeBusinessStatus), and is
 * nullable, hence the OR. Sits beside NOT_CLOSED_RESTAURANT_FILTER: repeated
 * `or` params are ANDed.
 */
export const NOT_GOOGLE_CLOSED_RESTAURANT_FILTER = 'business_status.is.null,business_status.neq.CLOSED_PERMANENTLY';

/**
 * PostgREST `or` filter for isVisitableStatus: our status says you can eat
 * there today. Built from NOT_VISITABLE_STATUSES so the two cannot drift. SQL
 * compares exactly, so a row spelled 'Closed' passes this and is caught by
 * isServingToday on the client; every writer stores the lower-case spelling.
 */
export const VISITABLE_STATUS_RESTAURANT_FILTER = `status.is.null,status.not.in.(${[
  ...NOT_VISITABLE_STATUSES,
].join(',')})`;

/**
 * PostgREST `or` filter for the business_status half of isServingToday:
 * Google does not call the place closed, for now or for good.
 */
export const SERVING_BUSINESS_STATUS_RESTAURANT_FILTER = `business_status.is.null,business_status.not.in.(${[
  ...NOT_SERVING_BUSINESS_STATUSES,
].join(',')})`;

/**
 * isServingToday as a query, for a list that is capped or counted on the
 * server (WEB-BE-045): filtering after the read lets closed rows take the
 * capped slots, and a head-only count has no rows to filter. Two `or` params,
 * which PostgREST ANDs with each other and with any other `or` on the query.
 */
export function applyServingRestaurantFilters<Q extends { or(filters: string): Q }>(query: Q): Q {
  return query.or(VISITABLE_STATUS_RESTAURANT_FILTER).or(SERVING_BUSINESS_STATUS_RESTAURANT_FILTER);
}

/**
 * One short line for a card or list row, or null when there is nothing honest
 * to say: "Open until 10 PM", "Closes at 10 PM", "Open 24 hours",
 * "Closed, opens 11 AM", "Closed".
 */
export function formatOpenStatusLine(result: RestaurantOpenResult): string | null {
  switch (result.status) {
    case 'open':
      return result.closesAt ? `Open until ${result.closesAt}` : 'Open 24 hours';
    case 'closing-soon':
      return result.closesAt ? `Closes at ${result.closesAt}` : 'Closing soon';
    case 'closed':
      return result.nextOpensAt ? `Closed, opens ${result.nextOpensAt}` : 'Closed';
    default:
      return null;
  }
}

/**
 * The stored shape of restaurants.hours_json (WEB-BE-045).
 *
 * Written by supabase/functions/_shared/placeHours.ts. Declared again here
 * rather than imported: that module is Deno source for the edge functions, and
 * this one is in the browser bundle. The Deno test place-hours.test.ts pins the
 * writer's shape; this reader treats every field as untrusted anyway, because
 * the row could predate any version of it.
 */
export interface StoredOpeningHours {
  version?: number;
  timeZone?: string;
  periods?: Array<{
    open?: { day?: number; hour?: number; minute?: number };
    close?: { day?: number; hour?: number; minute?: number };
  }>;
  weekdayDescriptions?: string[];
}
