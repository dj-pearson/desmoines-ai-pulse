// Central-time event windows shared by the edge functions that read events.
// No remote imports, so eventWindow.test.ts runs offline. WEB-FEAT-091.
//
// events.date and events.end_date are timestamptz. A bare YYYY-MM-DD compared
// with them is that day's UTC midnight, 6-7 PM Central the evening BEFORE,
// which is the bug nlp-search, api-events, the weekly digest and the weekend
// guide each had and each fixed with a private copy of the same arithmetic.
// Four copies meant a fix to one (the end_date arm, a visibility switch) would
// not reach the others; this module is the one copy they now import.
//
// The client side of the same rules is src/lib/eventRunningFilter.ts
// (upcomingOrRunningFilter; nlp-search/search.test.ts guards the drift) and
// applyEventVisibility in src/components/events/eventsHubQuery.ts.

import {
  centralWallClockFromUtc,
  centralWallClockToUtc,
} from "./centralTime.ts";

/** A calendar date in America/Chicago. */
export interface CentralDay {
  year: number;
  month: number;
  day: number;
}

/** A span of instants, both ends inclusive, as UTC ISO strings. */
export interface UtcWindow {
  start: string;
  end: string;
}

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The Central calendar date of `now`. */
export function centralToday(now: Date = new Date()): CentralDay {
  const [year, month, day] = centralWallClockFromUtc(now).slice(0, 10).split(
    "-",
  ).map(Number);
  return { year, month, day };
}

/**
 * `n` days after `day` (negative goes back). The arithmetic runs on noon UTC
 * of the date itself, so a DST change cannot move it, and an out-of-range day
 * (Aug 32) rolls into the next month.
 */
export function addCentralDays(day: CentralDay, n: number): CentralDay {
  const t = new Date(Date.UTC(day.year, day.month - 1, day.day + n, 12));
  return {
    year: t.getUTCFullYear(),
    month: t.getUTCMonth() + 1,
    day: t.getUTCDate(),
  };
}

/** 0 = Sunday ... 6 = Saturday. */
export function centralWeekday(day: CentralDay): number {
  return new Date(Date.UTC(day.year, day.month - 1, day.day, 12)).getUTCDay();
}

/** A strict YYYY-MM-DD: 2026-02-30 is refused, not rolled into March. */
export function parseCentralDay(ymd: string | null | undefined): CentralDay | null {
  const m = YMD.exec(ymd ?? "");
  if (!m) return null;
  const d = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  const check = addCentralDays(d, 0);
  return check.year === d.year && check.month === d.month && check.day === d.day
    ? d
    : null;
}

/** YYYY-MM-DD. */
export function formatCentralDay(day: CentralDay): string {
  const n = addCentralDays(day, 0);
  return `${n.year}-${String(n.month).padStart(2, "0")}-${
    String(n.day).padStart(2, "0")
  }`;
}

/** Central midnight at the start of `day`, as a UTC ISO instant. */
export function centralDayStartUtc(day: CentralDay): string {
  const n = addCentralDays(day, 0);
  return centralWallClockToUtc(n.year, n.month, n.day, 0, 0, 0)!.toISOString();
}

/** The last millisecond of `day` in Central time, as a UTC ISO instant. */
export function centralDayEndUtc(day: CentralDay): string {
  const next = new Date(centralDayStartUtc(addCentralDays(day, 1)));
  return new Date(next.getTime() - 1).toISOString();
}

/** `from` 00:00 through `to` 23:59:59.999 Central. */
export function centralDaySpan(from: CentralDay, to: CentralDay): UtcWindow {
  return { start: centralDayStartUtc(from), end: centralDayEndUtc(to) };
}

/**
 * Friday of the weekend in progress or, Monday to Thursday, the coming one.
 * nlp-search's "this weekend" and the web app's centralWindow() mean this.
 */
export function currentWeekendFriday(today: CentralDay): CentralDay {
  const dow = centralWeekday(today);
  return addCentralDays(today, dow === 0 ? -2 : dow === 6 ? -1 : 5 - dow);
}

/**
 * Friday of the NEXT weekend, never the one in progress: on a Friday,
 * Saturday or Sunday it is the following Friday. The weekend guide means this.
 */
export function nextWeekendFriday(today: CentralDay): CentralDay {
  const dow = centralWeekday(today);
  return addCentralDays(today, dow === 5 ? 7 : (5 - dow + 7) % 7);
}

/** Fri 00:00 through Sun 23:59:59.999 Central for the weekend of `friday`. */
export function weekendSpan(friday: CentralDay): UtcWindow {
  return centralDaySpan(friday, addCentralDays(friday, 2));
}

/**
 * The PostgREST `or=` group that keeps an event starting at or after
 * `lowerIso`, OR a run whose end_date is at or after it. A row with no
 * end_date matches only on its own date, so a past one-night show stays off.
 * Same string as src/lib/eventRunningFilter.ts.
 */
export function upcomingOrRunningFilter(lowerIso: string): string {
  return `date.gte.${lowerIso},end_date.gte.${lowerIso}`;
}

/** The slice of the postgrest-js filter builder applyEventVisibility uses. */
export interface VisibilityFilterBuilder<Q> {
  neq(column: string, value: boolean): Q;
  is(column: string, value: null): Q;
}

/**
 * Merged-away, moderator-hidden and archived rows are off the site, so they
 * are off every edge read that lists events. events RLS is public read, so
 * nothing else hides them. WEB-BE-034 (archived_at), WEB-FEAT-078.
 */
export function applyEventVisibility<Q extends VisibilityFilterBuilder<Q>>(
  q: Q,
): Q {
  return q.neq("is_merged", true).neq("is_hidden", true).is("archived_at", null);
}
