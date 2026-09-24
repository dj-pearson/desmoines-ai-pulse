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
import { centralDateOf, centralWindow, hasSpecificTime } from "@/lib/timezone";

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
