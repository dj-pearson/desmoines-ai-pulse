// Event window and date line for the weekly digest. No remote imports, so the
// suite next to this file runs offline. WEB-FEAT-089.
//
// Before this, the digest read `date >= <UTC date today>` and
// `date <= <UTC date + 7>`. events.date is timestamptz, so a bare date is that
// day's UTC midnight: 6-7 PM Central the evening BEFORE. The window started
// last night and ended a week from yesterday evening, and a run that opened
// before today (the State Fair on its fourth day, a festival weekend that
// began Thursday) was never in it. The date line also built
// `${date}T12:00:00Z` from the full timestamp, which is not a date, so every
// event in every digest read "Invalid Date".

import {
  addCentralDays,
  applyEventVisibility,
  centralDaySpan,
  centralToday,
} from "../_shared/eventWindow.ts";

/** Days in the digest window, today included. */
export const DIGEST_WINDOW_DAYS = 7;

/**
 * Runs that began before today, at most this many. They sort after the
 * starts and take slots only from the tail, so a three-month exhibit cannot
 * push this week's shows out of a six-item email.
 */
export const DIGEST_RUNNING_LIMIT = 2;

/** The slice of the postgrest-js filter builder these helpers use. */
export interface DigestFilterBuilder<Q> {
  neq(column: string, value: boolean): Q;
  is(column: string, value: null): Q;
  gte(column: string, value: string): Q;
  lt(column: string, value: string): Q;
  lte(column: string, value: string): Q;
}

export interface DigestWindow {
  /** Central midnight today, as a UTC ISO instant. */
  start: string;
  /** The last millisecond of the window's last Central day. */
  end: string;
}

export interface DigestEventDates {
  date: string;
  end_date?: string | null;
}

/** Today through the end of the seventh Central day, as UTC instants. */
export function digestWindow(now: Date = new Date()): DigestWindow {
  const today = centralToday(now);
  return centralDaySpan(today, addCentralDays(today, DIGEST_WINDOW_DAYS - 1));
}

// WEB-BE-034: archived_at is the other unpublish switch. A digest that mails
// an archived, hidden or merged-away event is what applyEventVisibility
// (_shared/eventWindow.ts, WEB-FEAT-091) prevents.

/** Events that start inside the window. Callers add select, order and limit. */
export function applyDigestStartsFilters<Q extends DigestFilterBuilder<Q>>(
  q: Q,
  w: DigestWindow,
): Q {
  return applyEventVisibility(q).gte("date", w.start).lte("date", w.end);
}

/**
 * Runs that began before today and are still on. A row with no end_date
 * never matches, so a past one-night show stays out. Callers order by
 * end_date and cap at DIGEST_RUNNING_LIMIT.
 */
export function applyDigestRunsFilters<Q extends DigestFilterBuilder<Q>>(
  q: Q,
  w: DigestWindow,
): Q {
  return applyEventVisibility(q).lt("date", w.start).gte("end_date", w.start);
}

/** Starts first (the subject leads with the first one), runs fill the tail. */
export function mergeDigestEvents<T>(starts: T[], runs: T[], max: number): T[] {
  const tail = runs.slice(0, Math.min(DIGEST_RUNNING_LIMIT, max));
  return [...starts.slice(0, Math.max(0, max - tail.length)), ...tail];
}

const DAY_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "America/Chicago",
};

function centralDay(instant: string): string | null {
  const t = new Date(instant);
  return Number.isNaN(t.getTime())
    ? null
    : t.toLocaleDateString("en-US", DAY_FORMAT);
}

/**
 * "Fri, Nov 20" for an event that starts in the window, "Through Sun, Nov 22"
 * for a run that began before it. Days are Central, not UTC: an 8 PM show is
 * on its own day, not the next one. An unreadable date gives an empty string,
 * never "Invalid Date".
 */
export function formatDigestEventDate(
  e: DigestEventDates,
  w: DigestWindow,
): string {
  const started = new Date(e.date).getTime();
  if (e.end_date && started < new Date(w.start).getTime()) {
    const through = centralDay(e.end_date);
    if (through) return `Through ${through}`;
  }
  return centralDay(e.date) ?? "";
}
