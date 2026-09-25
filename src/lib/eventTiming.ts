/**
 * When an event is, relative to now, on the Central clock
 * (docs/page-plans/events.md WP8 item 4).
 *
 * The detail page used to work this out inline and got three things wrong:
 *   - "days until" was Math.ceil over milliseconds, so a 7pm show viewed at
 *     9am was 0.42 days away, rounded up to 1, and read "Tomorrow". "Today"
 *     was only reachable in the instant the event started.
 *   - "past" meant the start instant had gone by, so day 2 of a three-day
 *     festival read "Past Event" and lost its calendar and hotel links.
 *   - it read the offset-less event_start_local before `date`.
 *
 * Here a day difference is between Central calendar dates, and an event is
 * over when its end has passed: end_date when the row has one, else start
 * plus three hours, else (no announced time) the end of its Central day.
 * Everything takes `now` so the rules are tested on a fixed clock.
 */
import { centralDateOf, centralWindow, formatInCentralTime, hasSpecificTime } from "@/lib/timezone";

/** Same assumed run time as eventEndIso in eventSchema.ts. */
export const DEFAULT_EVENT_HOURS = 3;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface EventTimingInput {
  date: string | Date | null;
  event_start_utc?: string | null;
  event_start_local?: string | null;
  end_date?: string | null;
  time_tbd?: boolean | null;
  /** Read by hasSpecificTime for the SeatGeek 03:30 placeholder (pass-2 WP2 item 2). */
  source_url?: string | null;
}

export type EventTimingTone = "now" | "today" | "soon" | "later" | "past";

export interface EventTiming {
  /** The start instant, or null when the row has no readable date. */
  start: Date | null;
  /** When the event counts as over. See the file header for the rule. */
  end: Date | null;
  /** False for "Time TBA" rows: the time part of `start` is a placeholder. */
  hasTime: boolean;
  isOver: boolean;
  isHappeningNow: boolean;
  /** Central calendar days from today to the start day; negative once begun. */
  daysUntil: number | null;
  /** "Happening now", "Today", "Tomorrow", "In 4 days", "Past event", or null. */
  label: string | null;
  tone: EventTimingTone | null;
}

function parse(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** event_start_utc, else `date`. Never the offset-less event_start_local. */
export function eventStart(event: EventTimingInput): Date | null {
  return parse(event.event_start_utc) ?? parse(event.date);
}

function dayStart(instant: Date): Date {
  return new Date(centralWindow({ kind: "single", date: centralDateOf(instant) }).start);
}

function dayEnd(instant: Date): Date {
  return new Date(centralWindow({ kind: "single", date: centralDateOf(instant) }).end);
}

function eventHasTime(event: EventTimingInput): boolean {
  // hasSpecificTime reads string fields; hand it strings.
  const date = event.date instanceof Date ? event.date.toISOString() : event.date;
  return hasSpecificTime({ ...event, date });
}

/**
 * The instant the event counts as over.
 *
 * An end_date before the start is ignored as bad data. With no announced time
 * the end is stretched to the end of that Central day, because a date-only
 * end_date or a placeholder start time says nothing about the hour.
 */
export function eventEnd(event: EventTimingInput): Date | null {
  const start = eventStart(event);
  if (!start) return null;
  const hasTime = eventHasTime(event);
  const explicit = parse(event.end_date);
  if (explicit && explicit.getTime() >= start.getTime()) {
    return hasTime ? explicit : dayEnd(explicit);
  }
  if (!hasTime) return dayEnd(start);
  return new Date(start.getTime() + DEFAULT_EVENT_HOURS * HOUR_MS);
}

/** Whole Central calendar days from `now`'s day to the event's start day. */
export function centralDaysUntil(event: EventTimingInput, now: Date = new Date()): number | null {
  const start = eventStart(event);
  if (!start) return null;
  const from = centralDateOf(now);
  const to = centralDateOf(start);
  // Both are yyyy-MM-dd; noon UTC keeps the subtraction clear of DST.
  const diff = Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`);
  return Math.round(diff / DAY_MS);
}

export function isEventOver(event: EventTimingInput, now: Date = new Date()): boolean {
  const end = eventEnd(event);
  return end ? now.getTime() > end.getTime() : false;
}

/**
 * Started and not over. An untimed event is "on" from the start of its
 * Central day, since its stored hour is a placeholder.
 */
export function isEventHappeningNow(event: EventTimingInput, now: Date = new Date()): boolean {
  const start = eventStart(event);
  const end = eventEnd(event);
  if (!start || !end) return false;
  const from = eventHasTime(event) ? start : dayStart(start);
  return now.getTime() >= from.getTime() && now.getTime() <= end.getTime();
}

export function eventTiming(event: EventTimingInput, now: Date = new Date()): EventTiming {
  const start = eventStart(event);
  const end = eventEnd(event);
  const hasTime = eventHasTime(event);
  const isOver = isEventOver(event, now);
  const isHappeningNow = !isOver && isEventHappeningNow(event, now);
  const daysUntil = centralDaysUntil(event, now);

  let label: string | null = null;
  let tone: EventTimingTone | null = null;
  if (!start) {
    // Nothing to say.
  } else if (isOver) {
    label = "Past event";
    tone = "past";
  } else if (isHappeningNow && (hasTime || (daysUntil ?? 0) < 0)) {
    // An untimed event on its own day reads "Today" below: its hour is a
    // placeholder, so "now" would be a guess. Day 2 of a festival is not.
    label = "Happening now";
    tone = "now";
  } else if (daysUntil === 0) {
    label = "Today";
    tone = "today";
  } else if (daysUntil === 1) {
    label = "Tomorrow";
    tone = "soon";
  } else if (daysUntil !== null && daysUntil > 1 && daysUntil <= 7) {
    label = `In ${daysUntil} days`;
    tone = "later";
  }

  return { start, end, hasTime, isOver, isHappeningNow, daysUntil, label, tone };
}

/** The Central date an event starts on, for "same night" comparisons. */
export function eventCentralDate(event: EventTimingInput): string | null {
  const start = eventStart(event);
  return start ? centralDateOf(start) : null;
}

// ---------------------------------------------------------------------------
// Time words (docs/page-plans/events-pass2.md WP2 items 1 and 5). One place
// decides what a card, the detail page and the map popup print for a start
// time, so they can't disagree about a row.
// ---------------------------------------------------------------------------

/** What a row with no published start time says. Never "All day". */
export const TIME_NOT_LISTED = "Time not listed";

/** "All day" is only for a row whose end_date carries it past its start day. */
export const ALL_DAY = "All day";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The Central date end_date falls on. A bare "yyyy-MM-dd" is already a
 * Central date; parsing it as UTC midnight would put it on the day before.
 */
function endCentralDate(event: EventTimingInput): string | null {
  const raw = event.end_date;
  if (!raw) return null;
  if (DATE_ONLY_RE.test(raw)) return raw;
  const d = parse(raw);
  return d ? centralDateOf(d) : null;
}

/** The explicit end, when it's a readable instant at or after the start. */
function explicitEnd(event: EventTimingInput): Date | null {
  const start = eventStart(event);
  const raw = event.end_date;
  if (!start || !raw) return null;
  const end = DATE_ONLY_RE.test(raw)
    ? new Date(centralWindow({ kind: "single", date: raw }).end)
    : parse(raw);
  if (!end || end.getTime() < start.getTime()) return null;
  return end;
}

/** "Sun, Aug 23" for a Central yyyy-MM-dd. Noon keeps it clear of DST edges. */
function centralDayLabel(day: string): string {
  return formatInCentralTime(new Date(`${day}T17:00:00Z`), "EEE, MMM d");
}

/**
 * The card's time word: "7:30 PM CT" when the source published a start time,
 * "All day" when it didn't but end_date runs past the start day, and
 * "Time not listed" otherwise. The 19:31:58 marker, time_tbd and SeatGeek's
 * 03:30 placeholder all count as not published (hasSpecificTime).
 */
export function eventTimeLabel(event: EventTimingInput): string {
  const start = eventStart(event);
  if (!start) return TIME_NOT_LISTED;
  if (eventHasTime(event)) return `${formatInCentralTime(start, "h:mm a")} CT`;
  const endDay = endCentralDate(event);
  if (endDay && endDay > centralDateOf(start)) return ALL_DAY;
  return TIME_NOT_LISTED;
}

/**
 * The span a row covers, when it has an explicit end_date worth saying:
 *   - a run already under way on an earlier day: "Runs through Sun, Aug 23";
 *   - a multi-day run not started yet: "Aug 13 - Aug 23";
 *   - a timed single-day row: "7:00 - 10:00 PM CT" or "11:00 AM - 2:00 PM CT".
 * null when there's no end_date, it's before the start, or the row is over.
 * Every word is absolute, so the label is still true in prerendered HTML read
 * a day later; `now` only decides which of the three shapes applies.
 */
export function eventRunLabel(event: EventTimingInput, now: Date = new Date()): string | null {
  const start = eventStart(event);
  const end = explicitEnd(event);
  if (!start || !end) return null;
  if (isEventOver(event, now)) return null;

  const startDay = centralDateOf(start);
  const endDay = endCentralDate(event) ?? centralDateOf(end);
  const today = centralDateOf(now);

  if (endDay > startDay) {
    if (startDay < today) return `Runs through ${centralDayLabel(endDay)}`;
    const from = formatInCentralTime(new Date(`${startDay}T17:00:00Z`), "MMM d");
    const to = formatInCentralTime(new Date(`${endDay}T17:00:00Z`), "MMM d");
    return `${from} - ${to}`;
  }

  // Same Central day: a time range, only when both ends are real times.
  if (!eventHasTime(event) || DATE_ONLY_RE.test(event.end_date ?? "")) return null;
  if (end.getTime() === start.getTime()) return null;
  const startMeridiem = formatInCentralTime(start, "a");
  const endMeridiem = formatInCentralTime(end, "a");
  const from =
    startMeridiem === endMeridiem
      ? formatInCentralTime(start, "h:mm")
      : formatInCentralTime(start, "h:mm a");
  return `${from} - ${formatInCentralTime(end, "h:mm a")} CT`;
}

/** Started on an earlier Central day and not over: day 2 of a festival. */
export function isRunningFromEarlierDay(event: EventTimingInput, now: Date = new Date()): boolean {
  const start = eventStart(event);
  if (!start || !explicitEnd(event)) return false;
  return centralDateOf(start) < centralDateOf(now) && !isEventOver(event, now);
}
