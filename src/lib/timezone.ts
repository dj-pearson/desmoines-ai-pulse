import { addDays, parseISO } from "date-fns";
import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { createLogger } from '@/lib/logger';

const logger = createLogger('timezone');

// Des Moines, Iowa timezone (Central Time)
export const CENTRAL_TIMEZONE = "America/Chicago";

// Marker time indicating no specific time was found (7:31:58 PM)
export const NO_TIME_MARKER = "19:31:58";

/**
 * Convert a date string or Date object to Central Time (Des Moines timezone)
 */
export function toCentralTime(date: string | Date): Date {
  const dateObj = typeof date === "string" ? parseISO(date) : date;
  return toZonedTime(dateObj, CENTRAL_TIMEZONE);
}

/**
 * Convert a Central Time date to UTC for storage
 */
export function centralTimeToUtc(date: Date): Date {
  return fromZonedTime(date, CENTRAL_TIMEZONE);
}

/**
 * Format a date in Central Time with the specified format
 */
export function formatInCentralTime(
  date: string | Date,
  formatStr: string = "MMM d, yyyy 'at' h:mm a"
): string {
  const dateObj = typeof date === "string" ? parseISO(date) : date;
  return formatInTimeZone(dateObj, CENTRAL_TIMEZONE, formatStr);
}

/**
 * Get the current date in Central Time
 */
export function nowInCentralTime(): Date {
  return toZonedTime(new Date(), CENTRAL_TIMEZONE);
}

/**
 * Create an event slug with Central Time date handling
 * This ensures consistent slug generation regardless of user's local timezone
 * Prefers new timezone fields over legacy date field
 */
export function createEventSlugWithCentralTime(
  title: string | null | undefined,
  event?: any
): string {
  // WEB-SEO-033. The parameter was typed `string` and called `.toLowerCase()`
  // on it directly. Every existing caller passed a non-null title, but the nine
  // link sites this story converted include one that already guards its title
  // as possibly null (ForYouRail's `rec.title ?? "Event"`), so a crash on a
  // link render is one nullable row away. Accepting null and producing an
  // empty title slug keeps the date suffix, which is the half that makes the
  // slug resolvable at all.
  const titleSlug = (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  if (!event) {
    return titleSlug;
  }

  try {
    let dateToUse: string | Date | undefined;
    
    // Use new timezone-aware fields if available
    if (event.event_start_utc) {
      dateToUse = event.event_start_utc;
    } else if (event.date) {
      dateToUse = event.date;
    }
    
    if (!dateToUse) {
      return titleSlug;
    }

    // Convert to Central Time first to ensure consistent date extraction
    const centralDate = toCentralTime(dateToUse);
    const year = centralDate.getFullYear();
    const month = String(centralDate.getMonth() + 1).padStart(2, "0");
    const day = String(centralDate.getDate()).padStart(2, "0");

    return `${titleSlug}-${year}-${month}-${day}`;
  } catch (error) {
    logger.error("createEventSlugWithCentralTime", "Error creating event slug with Central Time", { error: String(error) });
    return titleSlug;
  }
}

/**
 * Check if an event date is in the future (Central Time)
 */
export function isEventInFuture(eventDate: string | Date): boolean {
  try {
    const eventCentralTime = toCentralTime(eventDate);
    const nowCentralTime = nowInCentralTime();
    return eventCentralTime > nowCentralTime;
  } catch (error) {
    logger.error("isEventInFuture", "Error checking if event is in future", { error: String(error) });
    return false;
  }
}

/**
 * Check if an event has a specific time or uses the "no time" marker
 */
export function hasSpecificTime(event: any): boolean {
  try {
    // WEB-BE-038. An explicit flag beats a sentinel, and this is where the two
    // meet: NO_TIME_MARKER below is a TIME VALUE standing in for "no time",
    // which only works when the ingestion path happened to write that exact
    // value. SeatGeek writes 03:30:00 instead, which is indistinguishable from
    // a real showtime by inspection -- so the source's own time_tbd flag is now
    // carried onto the row and read first.
    //
    // Checking it here rather than at each call site means every display
    // surface honours it at once: EnhancedEventSEO, SocialEventCard and
    // EventDetails already branch on this function.
    if (event?.time_tbd) return false;

    // Check event_start_local first (new timezone field)
    if (event.event_start_local) {
      const time = event.event_start_local.split('T')[1]?.substring(0, 8);
      return time !== NO_TIME_MARKER;
    }
    
    // Fallback to legacy date field
    if (event.date) {
      const time = event.date.split('T')[1]?.substring(0, 8);
      return time !== NO_TIME_MARKER;
    }
    
    return false;
  } catch {
    return false;
  }
}

/**
 * Format an event date for display to users (always in Central Time)
 * Prefers new timezone fields over legacy date field
 */
export function formatEventDate(event: any): string {
  try {
    // Always use UTC field for display - it's the source of truth
    if (event.event_start_utc) {
      // Check if this event has a specific time set
      if (hasSpecificTime(event)) {
        return formatInCentralTime(event.event_start_utc, "EEEE, MMMM d, yyyy 'at' h:mm a");
      } else {
        return formatInCentralTime(event.event_start_utc, "EEEE, MMMM d, yyyy");
      }
    }
    
    // Fallback to legacy date field
    if (event.date) {
      if (hasSpecificTime(event)) {
        return formatInCentralTime(event.date, "EEEE, MMMM d, yyyy 'at' h:mm a");
      } else {
        return formatInCentralTime(event.date, "EEEE, MMMM d, yyyy");
      }
    }
    
    return "Date and time to be announced";
  } catch (error) {
    logger.error("formatEventDate", "Error formatting event date", { error: String(error) });
    return "Date and time to be announced";
  }
}

/**
 * Format an event date for card display (shorter format with day-of-week)
 * Prefers new timezone fields over legacy date field
 * Shows "Sat, Mar 15 @ 7:00 PM" when time available, "Sat, Mar 15" otherwise
 */
export function formatEventDateShort(event: any): string {
  try {
    // Always use UTC field for display - it's the source of truth
    if (event.event_start_utc) {
      if (hasSpecificTime(event)) {
        return formatInCentralTime(event.event_start_utc, "EEE, MMM d '@' h:mm a");
      } else {
        return formatInCentralTime(event.event_start_utc, "EEE, MMM d");
      }
    }

    // Fallback to legacy date field
    if (event.date) {
      if (hasSpecificTime(event)) {
        return formatInCentralTime(event.date, "EEE, MMM d '@' h:mm a");
      } else {
        return formatInCentralTime(event.date, "EEE, MMM d");
      }
    }

    return "Date TBA";
  } catch (error) {
    logger.error("formatEventDateShort", "Error formatting short event date", { error: String(error) });
    return "Date TBA";
  }
}

/**
 * Source order for an event's start instant, matching formatEventDate and
 * formatEventDateShort: the UTC column is the source of truth, the local
 * column is the fallback the crawlers populate, `date` is the legacy column.
 */
function eventStartSource(event: any): string | null {
  return event?.event_start_utc || event?.event_start_local || event?.date || null;
}

/**
 * Format one part of an event's start - a weekday, a month abbreviation, a
 * day number - in Central Time.
 *
 * WEB-QA-029. This exists because /music, /sports, /music/venues/:slug and
 * /sports/:slug each rendered their date tiles with
 * `new Date(event.date).toLocaleDateString(...)`, which formats in the
 * READER'S timezone. events.date is `timestamp with time zone`, so a 10pm
 * Central show is 03:00Z the next day and an Eastern reader is shown the wrong
 * weekday and the wrong day number. The whole premise of these pages is what
 * is on in Des Moines, so the answer must not depend on where the reader is
 * sitting.
 *
 * Returns null when the event carries no usable start, so a caller can drop
 * the element rather than print "Invalid Date".
 */
export function formatEventPart(event: any, formatStr: string): string | null {
  const source = eventStartSource(event);
  if (!source) return null;
  try {
    return formatInCentralTime(source, formatStr);
  } catch (error) {
    logger.error("formatEventPart", "Error formatting event part", { error: String(error) });
    return null;
  }
}

/**
 * The event's start time in Central, or null when no specific time is known.
 *
 * WEB-QA-029. The four hub pages printed a time unconditionally, so an event
 * with no known start rendered NO_TIME_MARKER (19:31:58) as a confident
 * "7:31 PM". hasSpecificTime already knows the answer - it reads the source's
 * own time_tbd flag first and the sentinel second - and nothing was asking it
 * here.
 */
export function formatEventTimeOnly(event: any): string | null {
  if (!hasSpecificTime(event)) return null;
  return formatEventPart(event, "h:mm a");
}

/**
 * The UTC instant at which a Central calendar day begins, as an ISO string.
 * `offsetDays` counts Central calendar days from today, so 1 is tomorrow.
 *
 * WEB-QA-029. /music and /sports built their "tonight" and "this week"
 * windows from `new Date(now.getFullYear(), now.getMonth(), now.getDate())` -
 * midnight in the READER'S timezone. A reader in London opening /music at
 * 2am is asking for a window that started at 6pm Central the previous day,
 * so "Tonight" shows last night. Going through the Central calendar date
 * also makes the DST boundaries fall where Des Moines has them, because each
 * day start is converted on its own rather than by adding 24h.
 */
export function centralDayStartUtcISO(offsetDays = 0): string {
  const todayCentral = formatInTimeZone(new Date(), CENTRAL_TIMEZONE, "yyyy-MM-dd");
  const target = offsetDays === 0
    ? todayCentral
    : formatInTimeZone(
        addDays(parseISO(`${todayCentral}T12:00:00Z`), offsetDays),
        "UTC",
        "yyyy-MM-dd"
      );
  return fromZonedTime(`${target}T00:00:00`, CENTRAL_TIMEZONE).toISOString();
}

/** Today's day of week in Central Time, 0 = Sunday through 6 = Saturday. */
export function centralDayOfWeek(): number {
  return Number(formatInTimeZone(new Date(), CENTRAL_TIMEZONE, "i")) % 7;
}

// ---------------------------------------------------------------------------
// Central-time windows (docs/page-plans/events.md WP0 item 1).
//
// Before this, "today", "this weekend" and "this month" had four definitions:
// the hub compared a TIMESTAMPTZ to a UTC calendar date, /events/today built
// its own Central day, /events/this-weekend had a private weekendWindow(), and
// the monthly pages had a fourth. Every surface now asks centralWindow() and
// gets the same set.
//
// All arithmetic is done on Central calendar dates (yyyy-MM-dd strings) and
// each boundary is converted to UTC on its own, so a DST day comes out 23h or
// 25h long instead of drifting by an hour.
// ---------------------------------------------------------------------------

/** A Central calendar date, `yyyy-MM-dd`. */
export type CentralDate = string;

export type CentralWindowPreset =
  | "today"
  | "tomorrow"
  | "this-weekend"
  | "this-week"
  | "next-week"
  | "next-7-days"
  | { kind: "single"; date: CentralDate }
  | { kind: "range"; from: CentralDate; to: CentralDate }
  | { kind: "month"; year: number; month: number };

export interface CentralWindow {
  /** UTC ISO instant of the first millisecond of the window. Use with `.gte`. */
  start: string;
  /** UTC ISO instant of the last millisecond of the window. Use with `.lte`. */
  end: string;
  /** First Central calendar day in the window, for labels. */
  startDay: CentralDate;
  /** Last Central calendar day in the window, for labels. */
  endDay: CentralDate;
}

const CENTRAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The Central calendar date an instant falls on. */
export function centralDateOf(instant: Date | string = new Date()): CentralDate {
  const d = typeof instant === "string" ? parseISO(instant) : instant;
  return formatInTimeZone(d, CENTRAL_TIMEZONE, "yyyy-MM-dd");
}

/** Add whole calendar days to a Central date. Pure date arithmetic, no zone. */
export function addCentralDays(day: CentralDate, days: number): CentralDate {
  const noonUtc = new Date(`${day}T12:00:00Z`);
  noonUtc.setUTCDate(noonUtc.getUTCDate() + days);
  return noonUtc.toISOString().slice(0, 10);
}

/** Day of week of a Central date, 0 = Sunday through 6 = Saturday. */
export function centralWeekday(day: CentralDate): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

/** UTC instant at which a Central calendar day begins. */
function centralDayStart(day: CentralDate): Date {
  return fromZonedTime(`${day}T00:00:00`, CENTRAL_TIMEZONE);
}

/** Window covering the Central days `from` through `to`, both inclusive. */
function daysWindow(from: CentralDate, to: CentralDate): CentralWindow {
  const [first, last] = from <= to ? [from, to] : [to, from];
  const start = centralDayStart(first);
  // One millisecond before the next day starts, so the window is inclusive for
  // `.lte` and the DST-change days keep their true 23h or 25h length.
  const end = new Date(centralDayStart(addCentralDays(last, 1)).getTime() - 1);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    startDay: first,
    endDay: last,
  };
}

function assertCentralDate(day: string, what: string): void {
  if (!CENTRAL_DATE_RE.test(day) || Number.isNaN(new Date(`${day}T12:00:00Z`).getTime())) {
    throw new RangeError(`centralWindow: ${what} must be yyyy-MM-dd, got "${day}"`);
  }
}

/**
 * The UTC bounds of a Central-time window.
 *
 * - `today` / `tomorrow`: one Central calendar day.
 * - `this-weekend`: Friday 00:00 to Sunday 23:59:59.999 Central. On Friday,
 *   Saturday and Sunday it is the weekend in progress, never next week's.
 *   This is what /events/this-weekend has always shipped and what its FAQ
 *   promises; the hub now returns the same set.
 * - `this-week`: today through the coming Sunday (on a Sunday, just today).
 * - `next-week`: the following Monday through Sunday.
 * - `next-7-days`: today and the six days after it.
 * - `single`, `range`: explicit Central dates, inclusive.
 * - `month`: `month` is 1-12.
 */
export function centralWindow(
  preset: CentralWindowPreset,
  now: Date = new Date()
): CentralWindow {
  const today = centralDateOf(now);

  if (typeof preset === "string") {
    const weekday = centralWeekday(today);
    switch (preset) {
      case "today":
        return daysWindow(today, today);
      case "tomorrow": {
        const tomorrow = addCentralDays(today, 1);
        return daysWindow(tomorrow, tomorrow);
      }
      case "this-weekend": {
        // Sun -> back 2 to Friday, Sat -> back 1, Fri -> 0, Mon-Thu -> ahead.
        const toFriday = weekday === 0 ? -2 : 5 - weekday;
        const friday = addCentralDays(today, toFriday);
        return daysWindow(friday, addCentralDays(friday, 2));
      }
      case "this-week": {
        const toSunday = weekday === 0 ? 0 : 7 - weekday;
        return daysWindow(today, addCentralDays(today, toSunday));
      }
      case "next-week": {
        const toMonday = weekday === 0 ? 1 : 8 - weekday;
        const monday = addCentralDays(today, toMonday);
        return daysWindow(monday, addCentralDays(monday, 6));
      }
      case "next-7-days":
        return daysWindow(today, addCentralDays(today, 6));
    }
  }

  switch (preset.kind) {
    case "single":
      assertCentralDate(preset.date, "date");
      return daysWindow(preset.date, preset.date);
    case "range":
      assertCentralDate(preset.from, "from");
      assertCentralDate(preset.to, "to");
      return daysWindow(preset.from, preset.to);
    case "month": {
      if (!Number.isInteger(preset.month) || preset.month < 1 || preset.month > 12) {
        throw new RangeError(`centralWindow: month must be 1-12, got ${preset.month}`);
      }
      const first = `${String(preset.year).padStart(4, "0")}-${String(preset.month).padStart(2, "0")}-01`;
      assertCentralDate(first, "month");
      const nextMonthFirst =
        preset.month === 12
          ? `${String(preset.year + 1).padStart(4, "0")}-01-01`
          : `${String(preset.year).padStart(4, "0")}-${String(preset.month + 1).padStart(2, "0")}-01`;
      return daysWindow(first, addCentralDays(nextMonthFirst, -1));
    }
  }
}

/** The hour (0-23) an instant falls on in Central time. */
export function centralHour(instant: Date | string = new Date()): number {
  const d = typeof instant === "string" ? parseISO(instant) : instant;
  return Number(formatInTimeZone(d, CENTRAL_TIMEZONE, "H"));
}

/**
 * The floor for "upcoming" lists: the start of today in Central, as a UTC ISO
 * instant. An event that started at 10am today is still on today's list at
 * 9pm; `new Date().toISOString().split("T")[0]` is a UTC date and drops
 * evening events after 7pm Central.
 */
export function upcomingFloorUtc(now: Date = new Date()): string {
  return centralDayStart(centralDateOf(now)).toISOString();
}
