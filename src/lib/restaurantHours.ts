/**
 * Is a restaurant open right now, in Des Moines time?
 *
 * The `opening` column is free text in formats such as:
 *   "Mon-Sat 11am-10pm, Sun 12-9pm"
 *   "Daily 11am-10pm"
 *   "24 hours"
 *   "Closed Mondays"
 *   "11:00 AM - 10:00 PM"
 *   "Tue-Sat 11am-2pm, 5-9pm"       (split shift)
 *   "Fri-Sat 6pm-2am"               (closes after midnight)
 *   "Daily 11-9, Closed Mon"
 *
 * Every surface (cards, map, /restaurants/open-now, the detail page, the
 * tonight pairings) reads this one evaluator, so they cannot disagree.
 *
 * THE CLOCK IS CENTRAL. `now` is an instant, and it is converted to
 * America/Chicago wall time before any day or hour is read. The browser's own
 * zone never enters into it, so a reader in London is not told a place is open
 * at 1am. A caller that already holds a zoned wall-clock Date passes
 * `{ wallClock: true }` so it is not converted twice.
 *
 * IT FAILS CLOSED. Text the parser cannot read with confidence returns
 * `unknown`, which callers render as no badge at all. A wrong "Open" costs more
 * trust than a missing one, so an unreadable day prefix drops its segment
 * rather than meaning every day, and bare hours with no am/pm are only read
 * when there is exactly one sensible reading.
 */
import { toZonedTime } from 'date-fns-tz';

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

export interface OpenStatusOptions {
  /**
   * True when `now` is already a zoned Date whose local fields are Central
   * wall time (a toZonedTime() result). Default false: `now` is an instant.
   */
  wallClock?: boolean;
}

export const DES_MOINES_TIME_ZONE = 'America/Chicago';

/** Within this many minutes of closing, an open place is "closing soon". */
export const CLOSING_SOON_MINUTES = 60;

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

/**
 * A Date whose local getDay()/getHours()/getMinutes() are Des Moines wall
 * time for the instant `now`. Only for reading those fields; its getTime() is
 * not the instant.
 */
export function desMoinesNow(now: Date = new Date()): Date {
  return toZonedTime(now, DES_MOINES_TIME_ZONE);
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DAY_ABBREVS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

/** "Mon." / "Mondays" / "TUES" to a day index, or undefined. */
function dayIndex(raw: string): number | undefined {
  const s = raw.trim().toLowerCase().replace(/\./g, '');
  if (s in DAY_ABBREVS) return DAY_ABBREVS[s];
  if (s.endsWith('s') && s.slice(0, -1) in DAY_ABBREVS) return DAY_ABBREVS[s.slice(0, -1)];
  return undefined;
}

/** Any word in the text that names a day. */
const DAY_WORD_RE = /\b(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*\.?/i;

// Range separators: hyphen, en dash (U+2013), em dash (U+2014), "to",
// "through", "thru". Written as escapes so this source stays ASCII.
const RANGE_SEP = '(?:-|\\u2013|\\u2014|to|through|thru)';

interface ClockTime {
  hours: number;
  minutes: number;
  meridiem: 'am' | 'pm' | null;
}

/** "11am", "11:00 AM", "22:00", "noon" to its parts, or null. */
function parseClock(raw: string): ClockTime | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '').replace(/\./g, '');
  if (s === 'noon' || s === '12noon') return { hours: 12, minutes: 0, meridiem: 'pm' };
  if (s === 'midnight' || s === '12midnight') return { hours: 12, minutes: 0, meridiem: 'am' };
  const match = s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm|a|p)?$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  if (hours > 23 || minutes > 59) return null;
  const m = match[3];
  const meridiem = m ? (m.startsWith('a') ? 'am' : 'pm') : null;
  if (meridiem && (hours < 1 || hours > 12)) return null;
  return { hours, minutes, meridiem };
}

/** Minutes since midnight for a clock time read with the given meridiem. */
function toMinutes(t: ClockTime, meridiem: 'am' | 'pm' | null): number {
  let h = t.hours;
  if (meridiem === 'pm' && h < 12) h += 12;
  if (meridiem === 'am' && h === 12) h = 0;
  return h * 60 + t.minutes;
}

/**
 * Resolve an open/close pair to minutes since midnight, or null when the text
 * has no single sensible reading.
 *
 *   "5-10pm"  -> 17:00-22:00 (the open borrows the close's meridiem)
 *   "11-2pm"  -> 11:00-14:00 (borrowing would put the open after the close)
 *   "11-9"    -> 11:00-21:00 (bare hours: only a morning-to-evening reading)
 *   "5-10"    -> null        (5am-10am or 5pm-10pm: ambiguous, fail closed)
 *   "11:00-22:00" -> literal 24-hour clock
 */
function resolveRange(openRaw: string, closeRaw: string): { open: number; close: number } | null {
  const open = parseClock(openRaw);
  const close = parseClock(closeRaw);
  if (!open || !close) return null;

  // 24-hour clock: an hour past 12 (or 0) with no meridiem anywhere.
  const twentyFourHour =
    !open.meridiem && !close.meridiem &&
    (open.hours > 12 || close.hours > 12 || open.hours === 0 || close.hours === 0);
  if (twentyFourHour) {
    return { open: open.hours * 60 + open.minutes, close: close.hours * 60 + close.minutes };
  }

  if (open.meridiem && close.meridiem) {
    return { open: toMinutes(open, open.meridiem), close: toMinutes(close, close.meridiem) };
  }

  if (!open.meridiem && close.meridiem) {
    const closeMin = toMinutes(close, close.meridiem);
    const same = toMinutes(open, close.meridiem);
    if (same < closeMin) return { open: same, close: closeMin };
    const other = toMinutes(open, close.meridiem === 'am' ? 'pm' : 'am');
    return { open: other, close: closeMin };
  }

  if (open.meridiem && !close.meridiem) {
    const openMin = toMinutes(open, open.meridiem);
    // "11am-10" reads as 22:00; "6pm-2" as 02:00 next day.
    const pm = toMinutes(close, 'pm');
    const am = toMinutes(close, 'am');
    if (open.meridiem === 'am') return { open: openMin, close: pm > openMin ? pm : am };
    return { open: openMin, close: am };
  }

  // Both bare, both 1-12. Only "later number first" has one reading: a
  // morning open and an evening close ("11-9", "12-8", "7-3").
  //
  // Bar hours break that reading (eat-drink pass 2, WP2.1). "Fri-Sat 4-2"
  // and "Daily 5-2" are 4 PM-2 AM, but the morning rule made them 4 AM-2 PM,
  // so a bar read Open at 10 on a Saturday morning. Nobody opens a dining
  // room at 1-5 AM, so an open hour of 1-5 is a PM open with a small-hours
  // close, which bare numbers cannot say: unknown. The same goes for a close
  // at 1 or 2 below the open ("9-2", "10-2"): Iowa's last call is 2 AM, so
  // "10 AM-2 PM" and "10 PM-2 AM" are both live readings.
  if (open.hours >= 1 && open.hours <= 5) return null;
  if (close.hours < open.hours && close.hours <= 2) return null;
  const openMin = toMinutes(open, 'am') === 0 ? 12 * 60 : toMinutes(open, 'am');
  const closeAm = toMinutes(close, 'am');
  if (closeAm <= openMin || open.hours === 12) {
    const closeMin = toMinutes(close, 'pm');
    if (closeMin > openMin) return { open: openMin, close: closeMin };
  }
  return null;
}

/**
 * A day prefix like "Mon-Fri", "Sat & Sun", "Daily" to a set of day indices.
 * An empty set means the prefix was not readable, and the caller drops the
 * segment: an unread prefix must not become "every day".
 */
function parseDayRange(raw: string): Set<number> {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/^hours\s*:?\s*/, '')
    .replace(/^open\s*:?\s*/, '')
    .replace(/[:\s]+$/, '')
    .trim();
  const days = new Set<number>();
  const all = () => {
    for (let i = 0; i < 7; i++) days.add(i);
    return days;
  };

  if (['daily', 'every day', 'everyday', '7 days', '7 days a week', 'seven days a week', 'all week'].includes(s)) {
    return all();
  }
  if (s === 'weekdays' || s === 'weekday') {
    for (let i = 1; i <= 5; i++) days.add(i);
    return days;
  }
  if (s === 'weekends' || s === 'weekend') {
    days.add(0);
    days.add(6);
    return days;
  }

  // A list of days and ranges: "mon-thu", "sat & sun", "mon, wed and fri".
  const items = s.split(/\s*(?:,|&|\/|\band\b)\s*/).filter(Boolean);
  if (items.length === 0) return days;
  const rangeRe = new RegExp(`^([a-z]+)\\s*${RANGE_SEP}\\s*([a-z]+)$`);
  for (const item of items) {
    const range = item.match(rangeRe);
    if (range) {
      const start = dayIndex(range[1]);
      const end = dayIndex(range[2]);
      if (start === undefined || end === undefined) return new Set();
      let i = start;
      for (;;) {
        days.add(i);
        if (i === end) break;
        i = (i + 1) % 7;
      }
      continue;
    }
    const single = dayIndex(item);
    if (single === undefined) return new Set();
    days.add(single);
  }
  return days;
}

interface TimeRange {
  days: Set<number>;
  openMinutes: number;
  closeMinutes: number;
}

/**
 * What the text parser made of an `opening` string.
 *
 * `dropped` is true when a segment that carried a time range could not be
 * read ("Sun Brunch 10am-2pm", "Drive-thru 24 hours", "Sat 5-10"). The days
 * that segment named are then not known to be closed, only not understood,
 * so a caller must not turn their absence into "Closed" (WP2.2).
 */
interface ParsedOpening {
  ranges: TimeRange[];
  dropped: boolean;
  /** Days the text says are closed, from "Closed Mon" or "Sunday: Closed". */
  closedDays: Set<number>;
}

interface SegmentResult {
  ranges: TimeRange[];
  dropped: boolean;
  /** Days a "<days>: Closed" segment names. */
  closedDays: Set<number>;
}

const CLOSED_DAYS_RE = new RegExp(
  `closed\\s+(?:on\\s+)?((?:sun|mon|tue|wed|thu|fri|sat)[a-z]*\\.?` +
    `(?:\\s*(?:&|/|\\band\\b|${RANGE_SEP})\\s*(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*\\.?)*)`,
  'gi',
);

/** Days the text says are closed: "Closed Mon", "closed on Mondays", "Closed Sun-Mon". */
function parseClosedDays(text: string): Set<number> {
  const closed = new Set<number>();
  for (const match of text.matchAll(CLOSED_DAYS_RE)) {
    for (const d of parseDayRange(match[1])) closed.add(d);
  }
  return closed;
}

function isPermanentlyClosedText(lower: string): boolean {
  return (
    lower === 'closed' ||
    lower.includes('permanently closed') ||
    lower.includes('closed permanently') ||
    lower.startsWith('temporarily closed') ||
    lower.includes('temporarily closed')
  );
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/**
 * The whole text says open around the clock, and nothing else. Anchored, so
 * "Tuesday: Open 24 hours; Wednesday: Closed" or "Drive-thru 24 hours; dining
 * room 10am-11pm" is not read as a 24/7 week (WP2.3). A day-scoped
 * "<days>: open 24 hours" is handled per segment instead.
 */
const WHOLE_WEEK_24H_RE =
  /^(?:(?:daily|every day|everyday|mon(?:day)?\s*(?:-|to|through|thru)\s*sun(?:day)?)\s*:?\s*)?(?:open\s+)?(?:24\s*(?:hours?|hrs?)(?:\s+a\s+day)?(?:\s*,?\s*7\s+days(?:\s+a\s+week)?)?|24\/7|always open)\.?$/;

/** "<days>: open 24 hours" within one segment: the prefix, or null. */
const SEGMENT_24H_RE = /^(.*?)\s*:?\s*(?:open\s+)?24\s*(?:hours?|hrs?)\.?$/;

/** "<days>: Closed" as a whole segment: the prefix, or null. */
const SEGMENT_CLOSED_RE = /^(.+?)\s*:?\s*closed\.?$/;

/**
 * Try to extract structured time ranges from the opening text.
 * Returns null if the text is too ambiguous to parse; empty ranges if it says
 * closed for good.
 */
function parseOpeningText(opening: string): ParsedOpening | null {
  const text = opening.trim().toLowerCase();

  if (WHOLE_WEEK_24H_RE.test(text)) {
    return {
      ranges: [{ days: new Set<number>(ALL_DAYS), openMinutes: 0, closeMinutes: MINUTES_PER_DAY }],
      dropped: false,
      closedDays: new Set(),
    };
  }

  if (isPermanentlyClosedText(text)) {
    return { ranges: [], dropped: false, closedDays: new Set() };
  }

  const ranges: TimeRange[] = [];
  let dropped = false;
  const closedDays = parseClosedDays(text);

  // Split on semicolons, pipes and newlines, then on commas that separate
  // day segments.
  const segments = opening
    .split(/[;|\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap(splitByDaySegments);

  for (const segment of segments) {
    const result = parseSegment(segment);
    ranges.push(...result.ranges);
    if (result.dropped) dropped = true;
    for (const d of result.closedDays) closedDays.add(d);
  }

  if (closedDays.size > 0) {
    for (const range of ranges) {
      for (const d of closedDays) range.days.delete(d);
    }
  }
  const kept = ranges.filter((r) => r.days.size > 0);
  if (kept.length > 0) return { ranges: kept, dropped, closedDays };
  // Every range landed on a closed day, or nothing was readable.
  return null;
}

/** Schema.org day-of-week names, indexed by JS getDay() (0 = Sunday). */
const SCHEMA_DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;

/** Format minutes-since-midnight as schema.org HH:MM (clamps midnight to 23:59). */
function minutesToClock(minutes: number): string {
  const m = Math.min(Math.max(minutes, 0), MINUTES_PER_DAY - 1);
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export interface OpeningHoursSpecification {
  '@type': 'OpeningHoursSpecification';
  dayOfWeek: string[];
  opens: string;
  closes: string;
}

/**
 * Convert the free-form `opening` text into schema.org OpeningHoursSpecification
 * entries using the SAME parser that powers the on-page open/closed badge, so
 * the structured data can never contradict the visible status. Returns null
 * when hours can't be parsed (or the place is always closed); callers should
 * then omit the spec rather than fabricate hours.
 */
export function getOpeningHoursSpecification(
  opening: string | null | undefined
): OpeningHoursSpecification[] | null {
  if (!opening || !opening.trim()) return null;
  const parsed = parseOpeningText(opening);
  // A dropped segment means part of the week is unread. Publishing the rest
  // would tell a crawler those days are closed (WP2.2).
  if (!parsed || parsed.dropped || parsed.ranges.length === 0) return null;
  const specs = parsed.ranges
    .filter((r) => r.days.size > 0)
    .map((r) => ({
      '@type': 'OpeningHoursSpecification' as const,
      dayOfWeek: Array.from(r.days)
        .sort((a, b) => a - b)
        .map((d) => SCHEMA_DAY_NAMES[d]),
      opens: minutesToClock(r.openMinutes),
      closes: minutesToClock(r.closeMinutes),
    }));
  return specs.length > 0 ? specs : null;
}

/**
 * Split a comma-separated string into day-based segments.
 *
 *   "Mon-Fri 11am-10pm, Sat-Sun 10am-11pm" -> two segments
 *   "Tue-Sat 11am-2pm, 5-9pm"              -> one segment (the second shift
 *                                             belongs to the same days)
 *   "Sat, Sun 10am-2pm"                    -> one segment (a day list)
 */
function splitByDaySegments(text: string): string[] {
  const parts = text.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return [text];

  const hasDayInfo = parts.some((p) => DAY_WORD_RE.test(p) || /\bdaily\b/i.test(p));
  if (!hasDayInfo) return [text];

  const out: string[] = [];
  let pendingDays = '';
  for (const part of parts) {
    const hasDigit = /\d/.test(part);
    const hasDay = DAY_WORD_RE.test(part) || /\b(daily|weekdays?|weekends?)\b/i.test(part);
    if (!hasDigit) {
      // "Sat" in "Sat, Sun 10am-2pm", or a note like "Closed Mon".
      if (hasDay && !/closed/i.test(part)) pendingDays = pendingDays ? `${pendingDays}, ${part}` : part;
      else out.push(part);
      continue;
    }
    if (pendingDays) {
      out.push(`${pendingDays}, ${part}`);
      pendingDays = '';
      continue;
    }
    if (!hasDay && out.length > 0 && /\d/.test(out[out.length - 1])) {
      // A second shift for the previous segment's days.
      out[out.length - 1] = `${out[out.length - 1]}, ${part}`;
      continue;
    }
    out.push(part);
  }
  if (pendingDays) out.push(pendingDays);
  return out;
}

// A clock time. The single-letter "a"/"p" form must end the word, so the "a"
// of "and" in "11-2 and 5-9" is not read as am.
const TIME_TOKEN = '(?:\\d{1,2}(?::\\d{2})?(?:\\s*(?:[ap]\\.?m\\.?|[ap])(?![a-z]))?|noon|midnight)';
// Not preceded or followed by a digit or colon, so a phone number such as
// 515-555-1234 never reads as a range.
const TIME_RANGE_RE = new RegExp(`(?<![\\d:])(${TIME_TOKEN})\\s*${RANGE_SEP}\\s*(${TIME_TOKEN})(?![\\d:])`, 'gi');

/**
 * Parse one segment: "Mon-Fri 11am-10pm", "11am - 10pm", "Tue-Sat 11am-2pm, 5-9pm".
 * Every time range in it shares the day prefix before the first one.
 */
function parseSegment(segment: string): SegmentResult {
  const lower = segment.trim().toLowerCase();
  const none: SegmentResult = { ranges: [], dropped: false, closedDays: new Set() };

  // "Tuesday: Open 24 hours" is a whole day for the days it names.
  const allDay = lower.match(SEGMENT_24H_RE);
  if (allDay) {
    const prefix = allDay[1].trim();
    const days = prefix ? parseDayRange(prefix) : new Set<number>();
    // No prefix inside a longer text, or one we cannot read ("Drive-thru"):
    // the segment is about something, and we do not know what.
    if (days.size === 0) return { ...none, dropped: true };
    return { ranges: [{ days, openMinutes: 0, closeMinutes: MINUTES_PER_DAY }], dropped: false, closedDays: new Set() };
  }

  const matches = [...lower.matchAll(TIME_RANGE_RE)];
  if (matches.length === 0) {
    // "Sunday: Closed" names its days as closed, which the hours table and the
    // evaluator both want to know.
    const closed = lower.match(SEGMENT_CLOSED_RE);
    if (closed) {
      const days = parseDayRange(closed[1]);
      if (days.size > 0) return { ...none, closedDays: days };
    }
    return none;
  }

  const beforeTime = lower.substring(0, matches[0].index ?? 0).trim();
  let days: Set<number>;
  if (beforeTime) {
    if (beforeTime.includes('closed')) return none;
    days = parseDayRange(beforeTime);
    // An unreadable prefix ("Sun Brunch", "Kitchen") drops the segment, and
    // says so: those hours exist, we just cannot place them.
    if (days.size === 0) return { ...none, dropped: true };
  } else {
    days = new Set<number>(ALL_DAYS);
  }

  const out: TimeRange[] = [];
  let dropped = false;
  for (const m of matches) {
    const range = resolveRange(m[1], m[2]);
    if (!range) {
      dropped = true;
      continue;
    }
    out.push({ days: new Set(days), openMinutes: range.open, closeMinutes: range.close });
  }
  return { ranges: out, dropped, closedDays: new Set() };
}

/** An open interval in minutes since Sunday 00:00, end exclusive, possibly past the week end. */
interface WeekInterval {
  start: number;
  end: number;
}

function intervalsFromRanges(ranges: readonly TimeRange[]): WeekInterval[] {
  const out: WeekInterval[] = [];
  for (const r of ranges) {
    for (const d of r.days) {
      const start = d * MINUTES_PER_DAY + r.openMinutes;
      let end = d * MINUTES_PER_DAY + r.closeMinutes;
      if (r.closeMinutes <= r.openMinutes) end += MINUTES_PER_DAY;
      out.push({ start, end });
    }
  }
  return out;
}

/** Sort and merge touching or overlapping intervals, wrapping Saturday night into Sunday. */
function mergeIntervals(intervals: readonly WeekInterval[]): WeekInterval[] {
  if (intervals.length === 0) return [];
  const sorted = intervals
    .map((i) => ({ start: i.start, end: Math.min(i.end, i.start + MINUTES_PER_WEEK) }))
    .sort((a, b) => a.start - b.start);
  const merged: WeekInterval[] = [];
  for (const i of sorted) {
    const last = merged[merged.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else merged.push({ ...i });
  }
  // An interval running past the week end may reach the first one.
  if (merged.length > 1) {
    const first = merged[0];
    const last = merged[merged.length - 1];
    if (last.end >= first.start + MINUTES_PER_WEEK) {
      last.end = Math.max(last.end, first.end + MINUTES_PER_WEEK);
      merged.shift();
    }
  }
  return merged;
}

/** "10 PM", "10:30 PM", "midnight", "noon". */
export function formatClockLabel(minutesOfDay: number): string {
  const m = ((minutesOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (m === 0) return 'midnight';
  if (m === 12 * 60) return 'noon';
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return mm === 0 ? `${h12} ${suffix}` : `${h12}:${String(mm).padStart(2, '0')} ${suffix}`;
}

const UNKNOWN: RestaurantOpenResult = {
  status: 'unknown',
  isOpen: false,
  closingSoon: false,
  closesAt: null,
  nextOpensAt: null,
  nextOpensInMinutes: null,
};

const CLOSED_FOR_GOOD: RestaurantOpenResult = {
  status: 'closed',
  isOpen: false,
  closingSoon: false,
  closesAt: null,
  nextOpensAt: null,
  nextOpensInMinutes: null,
};

/** The Central week minute (0 = Sunday 00:00) for `now`. */
function weekMinute(now: Date | undefined, options: OpenStatusOptions | undefined): number {
  const wall = options?.wallClock && now ? now : desMoinesNow(now ?? new Date());
  return wall.getDay() * MINUTES_PER_DAY + wall.getHours() * 60 + wall.getMinutes();
}

/** Evaluate a set of weekly intervals at week minute `t`. */
function evaluateIntervals(intervals: readonly WeekInterval[], t: number): RestaurantOpenResult {
  const merged = mergeIntervals(intervals);
  if (merged.length === 0) return { ...UNKNOWN };

  for (const i of merged) {
    for (const shift of [0, MINUTES_PER_WEEK]) {
      const at = t + shift;
      if (at >= i.start && at < i.end) {
        if (i.end - i.start >= MINUTES_PER_WEEK) {
          return { status: 'open', isOpen: true, closingSoon: false, closesAt: null, nextOpensAt: null, nextOpensInMinutes: null };
        }
        const left = i.end - at;
        const closingSoon = left <= CLOSING_SOON_MINUTES;
        return {
          status: closingSoon ? 'closing-soon' : 'open',
          isOpen: true,
          closingSoon,
          closesAt: formatClockLabel(i.end),
          nextOpensAt: null,
          nextOpensInMinutes: null,
        };
      }
    }
  }

  let wait = Infinity;
  let opensAt = 0;
  for (const i of merged) {
    const start = i.start % MINUTES_PER_WEEK;
    const delta = (start - t + MINUTES_PER_WEEK) % MINUTES_PER_WEEK;
    if (delta > 0 && delta < wait) {
      wait = delta;
      opensAt = start;
    }
  }
  if (!Number.isFinite(wait)) return { ...CLOSED_FOR_GOOD };

  const dayDelta = Math.floor((t + wait) / MINUTES_PER_DAY) - Math.floor(t / MINUTES_PER_DAY);
  const clock = formatClockLabel(opensAt);
  const label =
    dayDelta === 0 ? clock : dayDelta === 1 ? `tomorrow ${clock}` : `${DAY_SHORT[Math.floor(opensAt / MINUTES_PER_DAY)]} ${clock}`;
  return {
    status: 'closed',
    isOpen: false,
    closingSoon: false,
    closesAt: null,
    nextOpensAt: label,
    nextOpensInMinutes: wait,
  };
}

/**
 * Determine if a restaurant is open from its free-text `opening` field.
 *
 * @param opening - The restaurant's `opening` field.
 * @param now - The instant to evaluate at (default: now). Read in Central time.
 * @param options - `{ wallClock: true }` when `now` is already a zoned Date.
 * @returns `unknown` for empty or unreadable text, so no badge is shown.
 */
export function getRestaurantOpenStatus(
  opening: string | null | undefined,
  now?: Date,
  options?: OpenStatusOptions,
): RestaurantOpenResult {
  if (typeof opening !== 'string' || !opening.trim()) return { ...UNKNOWN };
  if (isPermanentlyClosedText(opening.trim().toLowerCase())) return { ...CLOSED_FOR_GOOD };

  const t = weekMinute(now, options);
  const today = Math.floor(t / MINUTES_PER_DAY);
  const parsed = parseOpeningText(opening);
  if (parsed === null) {
    // "Closed Mondays" with no readable hours still settles today, if today
    // is the day it names. Any other day stays unknown.
    return parseClosedDays(opening.toLowerCase()).has(today) ? { ...CLOSED_FOR_GOOD } : { ...UNKNOWN };
  }
  if (parsed.ranges.length === 0) return { ...CLOSED_FOR_GOOD };

  const result = evaluateIntervals(intervalsFromRanges(parsed.ranges), t);
  if (parsed.dropped && result.status === 'closed') {
    // Part of the week was unreadable, so "closed" may only mean "in the part
    // we could not read" (Sunday brunch). A day the text names as closed is
    // still closed, but the next opening may be in the unread part.
    return parsed.closedDays.has(today) ? { ...CLOSED_FOR_GOOD } : { ...UNKNOWN };
  }
  return result;
}

/** One day of an OpeningCoverage. */
export interface DayCoverage {
  /** JS day index, 0 = Sunday. */
  day: number;
  /**
   * `listed`: the text gives hours for this day. `closed`: the text says this
   * day is closed. `not-listed`: the text says nothing we could read, which
   * is not the same as closed.
   */
  state: 'listed' | 'closed' | 'not-listed';
  /** Ranges for a listed day, minutes since midnight. A close <= open runs past midnight. */
  ranges: Array<{ openMinutes: number; closeMinutes: number }>;
}

export interface OpeningCoverage {
  /** Seven entries, Sunday first. */
  days: DayCoverage[];
  listedDays: number[];
  closedDays: number[];
  /** True when a segment carrying hours could not be read. */
  hasUnreadSegment: boolean;
}

/**
 * Which days the free text actually covers (WP2.2, for the detail page's
 * hours table). A day with no range is only "closed" when the text says so;
 * otherwise it is "not listed". Null for empty text or text with nothing
 * readable at all.
 */
export function getOpeningCoverage(opening: string | null | undefined): OpeningCoverage | null {
  if (typeof opening !== 'string' || !opening.trim()) return null;
  const lower = opening.trim().toLowerCase();
  if (isPermanentlyClosedText(lower)) {
    return {
      days: ALL_DAYS.map((day) => ({ day, state: 'closed' as const, ranges: [] })),
      listedDays: [],
      closedDays: [...ALL_DAYS],
      hasUnreadSegment: false,
    };
  }
  const parsed = parseOpeningText(opening);
  const closed = parsed?.closedDays ?? parseClosedDays(lower);
  if (!parsed && closed.size === 0) return null;

  const days: DayCoverage[] = ALL_DAYS.map((day) => {
    const ranges = (parsed?.ranges ?? [])
      .filter((r) => r.days.has(day))
      .map((r) => ({ openMinutes: r.openMinutes, closeMinutes: r.closeMinutes }))
      .sort((a, b) => a.openMinutes - b.openMinutes);
    if (ranges.length > 0) return { day, state: 'listed' as const, ranges };
    if (closed.has(day)) return { day, state: 'closed' as const, ranges: [] };
    return { day, state: 'not-listed' as const, ranges: [] };
  });
  return {
    days,
    listedDays: days.filter((d) => d.state === 'listed').map((d) => d.day),
    closedDays: days.filter((d) => d.state === 'closed').map((d) => d.day),
    hasUnreadSegment: parsed?.dropped ?? false,
  };
}

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

/**
 * schema.org OpeningHoursSpecification from the STRUCTURED hours, or null.
 *
 * Preferred over the free-text parser wherever a row has this column, because
 * the text parser is a best effort over strings like "Mon-Sat 11am-10pm, Sun
 * 12-9pm" and this is what Google returned. Null when there is nothing usable,
 * so the caller omits the node rather than publishing invented hours - the
 * WEB-SEO-024 rule.
 *
 * A PERIOD WITH NO `close` IS DROPPED, not published as open-ended. Places uses
 * that for a venue open 24 hours, and the honest schema.org form for it is
 * opens 00:00 / closes 23:59 - which is a claim about the venue rather than a
 * transcription, so it waits for a row that actually has one.
 *
 * A period that crosses midnight (open Friday 20:00, close Saturday 02:00) is
 * emitted against the OPENING day. schema.org has no cross-day form, and
 * splitting it into two entries would advertise Saturday 00:00-02:00 as a
 * separate opening, which reads as "open Saturday morning".
 */
export function getOpeningHoursSpecificationFromJson(
  hours: StoredOpeningHours | null | undefined
): OpeningHoursSpecification[] | null {
  const periods = hours?.periods;
  if (!Array.isArray(periods) || periods.length === 0) return null;

  const specs: OpeningHoursSpecification[] = [];
  for (const period of periods) {
    const open = period?.open;
    const close = period?.close;
    if (!open || typeof open.day !== 'number' || typeof open.hour !== 'number') continue;
    if (!close || typeof close.hour !== 'number') continue;
    const day = SCHEMA_DAY_NAMES[open.day];
    if (!day) continue;
    specs.push({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: [day],
      opens: minutesToClock(open.hour * 60 + (open.minute ?? 0)),
      closes: minutesToClock(close.hour * 60 + (close.minute ?? 0)),
    });
  }
  return specs.length > 0 ? specs : null;
}

/**
 * The structured hours when the row has them, the free text otherwise.
 *
 * One entry point so a caller cannot accidentally publish the weaker source
 * while the better one sits in the same row (WEB-BE-045 AC4).
 */
export function resolveOpeningHoursSpecification(
  hoursJson: StoredOpeningHours | null | undefined,
  opening: string | null | undefined
): OpeningHoursSpecification[] | null {
  return getOpeningHoursSpecificationFromJson(hoursJson) ?? getOpeningHoursSpecification(opening);
}

function isInt(n: unknown, min: number, max: number): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;
}

/**
 * Weekly intervals from hours_json periods, or [] when none is usable.
 *
 * A period with no `close` is dropped, the same rule as
 * getOpeningHoursSpecificationFromJson: it is not read as "open around the
 * clock". A period whose close is earlier in the week than its open wraps
 * past Saturday night, so a Saturday 20:00 to Sunday 02:00 period is handled
 * without any special case.
 */
function intervalsFromJson(hours: StoredOpeningHours | null | undefined): WeekInterval[] {
  const periods = hours?.periods;
  if (!Array.isArray(periods)) return [];
  const out: WeekInterval[] = [];
  for (const period of periods) {
    const open = period?.open;
    const close = period?.close;
    if (!open || !close) continue;
    if (!isInt(open.day, 0, 6) || !isInt(open.hour, 0, 23)) continue;
    if (!isInt(close.hour, 0, 24)) continue;
    const openMinute = open.minute ?? 0;
    const closeMinute = close.minute ?? 0;
    if (!isInt(openMinute, 0, 59) || !isInt(closeMinute, 0, 59)) continue;
    const closeDay = close.day ?? open.day;
    if (!isInt(closeDay, 0, 6)) continue;
    const start = open.day * MINUTES_PER_DAY + open.hour * 60 + openMinute;
    let end = closeDay * MINUTES_PER_DAY + close.hour * 60 + closeMinute;
    if (end <= start) end += MINUTES_PER_WEEK;
    out.push({ start, end });
  }
  return out;
}

/**
 * Open status from the structured hours when the row carries them, the free
 * text otherwise. The status twin of resolveOpeningHoursSpecification, so the
 * badge and the published schema read the same source.
 *
 * It reads only what it is passed. A list query that does not select
 * hours_json passes undefined and gets the text evaluator; nothing here adds
 * a column to any select.
 */
export function resolveOpenStatus(
  hoursJson: StoredOpeningHours | null | undefined,
  opening: string | null | undefined,
  now?: Date,
  options?: OpenStatusOptions,
): RestaurantOpenResult {
  const intervals = intervalsFromJson(hoursJson);
  if (intervals.length > 0) {
    return evaluateIntervals(intervals, weekMinute(now, options));
  }
  return getRestaurantOpenStatus(opening, now, options);
}
