// Filters for the public events API (api-events). No remote imports, so the
// suite next to this file runs offline.
//
// api-events is the documented public feed (public/openapi.yaml, llms.txt).
// Before WEB-FEAT-078 it differed from every page on the site in four ways:
//
//   1. It filtered neither unpublish switch, nor is_merged. events RLS is
//      public read, so a moderator-hidden event, an archived one and the loser
//      of a duplicate merge were all served to anyone who asked, list and
//      detail alike. The web app hides them with the same three filters
//      (applyEventVisibility in src/components/events/eventsHubQuery.ts).
//   2. "today" was the UTC date. From 7 PM CDT (6 PM CST) that is already
//      tomorrow, so anything that started earlier today and is still on (an
//      afternoon festival, a 5 PM show) dropped out of the evening's list.
//   3. No end_date arm, so a multi-day run (the State Fair, a festival
//      weekend) left the feed on its second morning while /events kept it.
//   4. end_date=YYYY-MM-DD compared a timestamptz with that date's UTC
//      midnight, which is 6-7 PM Central the evening BEFORE, so the last day
//      of the requested range was missing entirely.
//
// The response shape is unchanged apart from one added field (end_date).

import {
  applyEventVisibility,
  centralDayEndUtc as dayEndUtc,
  centralDayStartUtc as dayStartUtc,
  centralToday,
  formatCentralDay,
  parseCentralDay,
  upcomingOrRunningFilter,
} from "../_shared/eventWindow.ts";
import { sanitizePostgrestPattern } from "../_shared/validation.ts";

// The day arithmetic, the or= group and the visibility switches live in
// _shared/eventWindow.ts (WEB-FEAT-091). index.ts and the suite keep
// importing them from here.
export { applyEventVisibility, upcomingOrRunningFilter };

/** The slice of the postgrest-js filter builder these helpers use. */
export interface EventFilterBuilder<Q> {
  eq(column: string, value: string): Q;
  neq(column: string, value: boolean): Q;
  is(column: string, value: null): Q;
  lte(column: string, value: string): Q;
  or(filters: string): Q;
}

export interface EventListParams {
  category?: string;
  location?: string;
  search?: string;
  start_date?: string;
  end_date?: string;
}

/** Central midnight at the start of a YYYY-MM-DD date, as a UTC ISO instant. */
export function centralDayStartUtc(ymd: string): string | null {
  const d = parseCentralDay(ymd);
  return d ? dayStartUtc(d) : null;
}

/** The last millisecond of a YYYY-MM-DD date in Central time, as a UTC ISO instant. */
export function centralDayEndUtc(ymd: string): string | null {
  const d = parseCentralDay(ymd);
  return d ? dayEndUtc(d) : null;
}

/** Today's Central date as YYYY-MM-DD. */
export function centralTodayYmd(now: Date = new Date()): string {
  return formatCentralDay(centralToday(now));
}

/**
 * Every filter on the list read. Callers add select, order and range.
 *
 * The date window, location and search groups go out as ONE `or=` parameter,
 * `and(or(window),or(location),or(search))`, the shape useAdvancedSearch and
 * useEventLanding use, rather than three repeated `or` params.
 */
export function applyEventListFilters<Q extends EventFilterBuilder<Q>>(
  q: Q,
  params: EventListParams,
  now: Date = new Date(),
): Q {
  // A start_date that is not YYYY-MM-DD is passed through as before, so the
  // endpoint accepts exactly what it accepted.
  const lower = params.start_date
    ? centralDayStartUtc(params.start_date) ?? params.start_date
    : centralDayStartUtc(centralTodayYmd(now))!;

  let out = applyEventVisibility(q);
  if (params.end_date) {
    out = out.lte("date", centralDayEndUtc(params.end_date) ?? params.end_date);
  }
  if (params.category) {
    out = out.eq("category", params.category);
  }

  const groups = [`or(${upcomingOrRunningFilter(lower)})`];
  const location = params.location ? sanitizePostgrestPattern(params.location, 100) : "";
  if (location) {
    groups.push(`or(location.ilike.%${location}%,city.ilike.%${location}%,venue.ilike.%${location}%)`);
  }
  const search = params.search ? sanitizePostgrestPattern(params.search, 200) : "";
  if (search) {
    groups.push(`or(title.ilike.%${search}%,enhanced_description.ilike.%${search}%,venue.ilike.%${search}%)`);
  }

  return out.or(groups.length === 1 ? upcomingOrRunningFilter(lower) : `and(${groups.join(",")})`);
}
