// Central-time date windows for nlp-search.
//
// events.date is TIMESTAMPTZ. This function used to bound it with UTC
// calendar dates, so after 7pm CDT "tonight" returned tomorrow's events and
// "this weekend" meant Sat-Sun on the UTC calendar. The web app's
// centralWindow() (src/lib/timezone.ts) defines the same presets; the weekend
// here matches it: Fri 00:00 through Sun 23:59:59.999 America/Chicago, and on
// Fri/Sat/Sun it is the weekend in progress.

import { centralWallClockFromUtc } from "../_shared/centralTime.ts";
import {
  addCentralDays,
  centralDaySpan,
  centralDayStartUtc,
  centralToday,
  centralWeekday,
  currentWeekendFriday,
  parseCentralDay,
  upcomingOrRunningFilter,
  type UtcWindow,
  weekendSpan,
} from "../_shared/eventWindow.ts";

// The Central-day arithmetic and the or= group live in _shared/eventWindow.ts
// (WEB-FEAT-091); search.ts and the suites keep importing them from here.
export { upcomingOrRunningFilter };
export type { UtcWindow };

export type NlpDateFilter =
  | "today"
  | "tomorrow"
  | "this_weekend"
  | "this_week"
  | "next_week"
  | "specific";

/** Start of today in Central time, as a UTC ISO instant. */
export function centralTodayStartUtc(now: Date = new Date()): string {
  return centralDayStartUtc(centralToday(now));
}

/** Central date of `now` as YYYY-MM-DD, for the prompt given to the model. */
export function centralTodayString(now: Date = new Date()): string {
  return centralWallClockFromUtc(now).slice(0, 10);
}

/**
 * UTC bounds for a parsed date intent, or null when the intent carries no
 * usable window (unknown preset, or "specific" without a valid YYYY-MM-DD).
 */
export function nlpDateWindow(
  filter: NlpDateFilter | string | null | undefined,
  now: Date = new Date(),
  specificDate?: string | null,
): UtcWindow | null {
  const today = centralToday(now);
  const dow = centralWeekday(today); // 0 = Sunday
  switch (filter) {
    case "today":
      return centralDaySpan(today, today);
    case "tomorrow": {
      const t = addCentralDays(today, 1);
      return centralDaySpan(t, t);
    }
    case "this_weekend":
      // Fri, Sat and Sun are inside the weekend in progress.
      return weekendSpan(currentWeekendFriday(today));
    case "this_week": {
      // Today through Sunday.
      const toSunday = dow === 0 ? 0 : 7 - dow;
      return centralDaySpan(today, addCentralDays(today, toSunday));
    }
    case "next_week": {
      // The Monday-Sunday week after this one.
      const toNextMonday = dow === 0 ? 1 : 8 - dow;
      const mon = addCentralDays(today, toNextMonday);
      return centralDaySpan(mon, addCentralDays(mon, 6));
    }
    case "specific": {
      const d = parseCentralDay(specificDate);
      return d ? centralDaySpan(d, d) : null;
    }
    default:
      return null;
  }
}
