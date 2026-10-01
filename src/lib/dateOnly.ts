/**
 * Date-only strings ("yyyy-MM-dd") as calendar days, not instants.
 *
 * `new Date("2026-10-02")` is UTC midnight, which in Central time is 7pm on
 * October 1. Every trip date on /trip-planner went through it, so the badge,
 * the day headers, the My Trips cards and the .ics stops all landed a day
 * early (plan-stay WP1 item 1). date-fns `parseISO` reads a bare date as
 * local midnight, which is the calendar day the string names.
 */
import { differenceInCalendarDays, format, isValid, parseISO } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { addCentralDays, centralDateOf, CENTRAL_TIMEZONE } from "@/lib/timezone";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date written as yyyy-MM-dd. */
export function isDateOnly(value: string | null | undefined): value is string {
  if (!value || !DATE_ONLY_RE.test(value)) return false;
  const d = parseISO(value);
  return isValid(d) && format(d, "yyyy-MM-dd") === value;
}

/**
 * The local-midnight Date for a yyyy-MM-dd string, for display with date-fns
 * `format`. A longer ISO string is cut to its date part first, so a
 * `timestamptz` read back as "2026-10-02T00:00:00+00:00" still means Oct 2.
 */
export function parseDateOnly(value: string): Date {
  return parseISO(value.slice(0, 10));
}

/** Inclusive number of calendar days from `from` to `to` (Oct 9-11 is 3). */
export function dateOnlySpanDays(from: string, to: string): number {
  return differenceInCalendarDays(parseDateOnly(to), parseDateOnly(from)) + 1;
}

/**
 * The UTC instant of a Des Moines wall-clock time: day `dayOffset` after
 * `startDate`, at `hhmm` ("18:00" or "18:00:00") in America/Chicago. Used for
 * calendar exports, so a visitor planning from Denver still gets the times
 * the venue keeps.
 */
export function centralWallClock(startDate: string, dayOffset: number, hhmm: string): Date {
  const day = addCentralDays(startDate.slice(0, 10), dayOffset);
  const [h = "0", m = "0"] = hhmm.split(":");
  const hh = String(Number(h)).padStart(2, "0");
  const mm = String(Number(m) || 0).padStart(2, "0");
  return fromZonedTime(`${day}T${hh}:${mm}:00`, CENTRAL_TIMEZONE);
}

/** Minutes since midnight for "HH:mm[:ss]", or null when unreadable. */
export function clockMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** Longest window the trip planner lists. Past two weeks it stops being a trip. */
export const MAX_TRIP_WINDOW_DAYS = 14;

/**
 * Why a from/to pair can't be a trip window, or null when it can. `today` is
 * the Central calendar day (injectable for tests); a window that has already
 * ended is refused, so a stale shared link doesn't list last year's events.
 * A window that started earlier but runs through today is still a trip.
 */
export function tripWindowProblem(from: string, to: string, today: string = centralDateOf()): string | null {
  if (!isDateOnly(from) || !isDateOnly(to)) return "Pick a start and an end date.";
  if (to < from) return "The end date is before the start date.";
  if (to < today) return "Pick dates from today on.";
  if (dateOnlySpanDays(from, to) > MAX_TRIP_WINDOW_DAYS) {
    return `Pick ${MAX_TRIP_WINDOW_DAYS} days or fewer.`;
  }
  return null;
}
