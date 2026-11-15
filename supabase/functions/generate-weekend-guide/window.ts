// Which events the weekend guide is written from. No remote imports, so the
// suite next to this file runs offline. WEB-FEAT-089 (slice 2).
//
// Before this, the guide worked out "next Friday" and "next Sunday" in server
// time (UTC) and sent bare dates: `date >= <fri>` and `date <= <sun>`.
// events.date is timestamptz, so a bare date is that day's UTC midnight, 6-7
// PM Central the evening BEFORE. The window ran from Thursday evening to
// Saturday evening: Thursday night shows were in, Saturday night and all of
// Sunday were out. A run that opened before Friday (a festival that began
// Thursday, a month-long exhibit) was never in it, and hidden, merged-away
// and archived rows were.
//
// The weekend is the same span nlp-search's "this_weekend" and the web app's
// centralWindow() use: Fri 00:00 through Sun 23:59:59.999 America/Chicago.
// Unlike those, the guide always means the NEXT weekend, never the one in
// progress: the cron fires Sunday 9 PM Central to write the coming one, and on
// a Friday or Saturday run the guide for this weekend is already out.

import {
  applyEventVisibility,
  centralToday,
  formatCentralDay,
  nextWeekendFriday,
  upcomingOrRunningFilter,
  weekendSpan,
} from "../_shared/eventWindow.ts";

/** The slice of the postgrest-js filter builder these helpers use. */
export interface WeekendFilterBuilder<Q> {
  neq(column: string, value: boolean): Q;
  is(column: string, value: null): Q;
  lte(column: string, value: string): Q;
  or(filters: string): Q;
}

export interface WeekendWindow {
  /** Central date of the Friday, YYYY-MM-DD: weekend_guides.week_start. */
  friday: string;
  /** Friday 00:00 Central, as a UTC ISO instant. */
  start: string;
  /** Sunday 23:59:59.999 Central, as a UTC ISO instant. */
  end: string;
}

export interface WeekendEventDates {
  date: string;
  end_date?: string | null;
}

/** The coming Friday-Sunday in Central time. On a Friday, the one after. */
export function nextWeekendWindow(now: Date = new Date()): WeekendWindow {
  const friday = nextWeekendFriday(centralToday(now));
  return { friday: formatCentralDay(friday), ...weekendSpan(friday) };
}

/**
 * Visible events that start in the weekend, plus runs that began before it
 * and are still on by Friday. A row with no end_date matches only on its own
 * date, so a past one-night show stays out. The visibility switches and the
 * or= group come from _shared/eventWindow.ts (WEB-FEAT-091). Callers add
 * select and order.
 */
export function applyWeekendGuideFilters<Q extends WeekendFilterBuilder<Q>>(
  q: Q,
  w: WeekendWindow,
): Q {
  return applyEventVisibility(q)
    .lte("date", w.end)
    .or(upcomingOrRunningFilter(w.start));
}

const DAY_TIME: Intl.DateTimeFormatOptions = {
  weekday: "long",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Chicago",
};

const DAY_ONLY: Intl.DateTimeFormatOptions = {
  weekday: "long",
  month: "short",
  day: "numeric",
  timeZone: "America/Chicago",
};

function fmt(instant: string, opts: Intl.DateTimeFormatOptions): string | null {
  const t = new Date(instant);
  return Number.isNaN(t.getTime()) ? null : t.toLocaleString("en-US", opts);
}

/**
 * The date line the model groups by day: "Saturday, Nov 21, 8:00 PM" in
 * Central, or "Running through Sunday, Nov 29" for a run that began before
 * Friday. The prompt used to carry the raw UTC timestamp, so a Friday 8 PM
 * show read as Saturday 02:00 and was filed under the wrong day.
 */
export function formatGuideEventDate(
  e: WeekendEventDates,
  w: WeekendWindow,
): string {
  if (e.end_date && new Date(e.date).getTime() < new Date(w.start).getTime()) {
    const through = fmt(e.end_date, DAY_ONLY);
    if (through) return `Running through ${through}`;
  }
  return fmt(e.date, DAY_TIME) ?? "Date not listed";
}
