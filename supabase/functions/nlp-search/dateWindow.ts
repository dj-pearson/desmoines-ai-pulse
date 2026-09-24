// Central-time date windows for nlp-search.
//
// events.date is TIMESTAMPTZ. This function used to bound it with UTC
// calendar dates, so after 7pm CDT "tonight" returned tomorrow's events and
// "this weekend" meant Sat-Sun on the UTC calendar. The web app's
// centralWindow() (src/lib/timezone.ts) defines the same presets; the weekend
// here matches it: Fri 00:00 through Sun 23:59:59.999 America/Chicago, and on
// Fri/Sat/Sun it is the weekend in progress.

import {
  centralWallClockFromUtc,
  centralWallClockToUtc,
} from "../_shared/centralTime.ts";

export type NlpDateFilter =
  | "today"
  | "tomorrow"
  | "this_weekend"
  | "this_week"
  | "next_week"
  | "specific";

export interface UtcWindow {
  start: string;
  end: string;
}

interface CentralDay {
  year: number;
  month: number;
  day: number;
}

function centralToday(now: Date): CentralDay {
  const [y, m, d] = centralWallClockFromUtc(now).slice(0, 10).split("-").map(
    Number,
  );
  return { year: y, month: m, day: d };
}

// Calendar arithmetic on the Central date itself (noon UTC avoids any DST edge).
function addDays(day: CentralDay, n: number): CentralDay {
  const t = new Date(Date.UTC(day.year, day.month - 1, day.day + n, 12));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

function weekday(day: CentralDay): number {
  return new Date(Date.UTC(day.year, day.month - 1, day.day, 12)).getUTCDay();
}

function dayStartUtc(day: CentralDay): string {
  return centralWallClockToUtc(day.year, day.month, day.day, 0, 0, 0)!
    .toISOString();
}

function dayEndUtc(day: CentralDay): string {
  const next = addDays(day, 1);
  return new Date(
    centralWallClockToUtc(next.year, next.month, next.day, 0, 0, 0)!.getTime() -
      1,
  ).toISOString();
}

function span(from: CentralDay, to: CentralDay): UtcWindow {
  return { start: dayStartUtc(from), end: dayEndUtc(to) };
}

/** Start of today in Central time, as a UTC ISO instant. */
export function centralTodayStartUtc(now: Date = new Date()): string {
  return dayStartUtc(centralToday(now));
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
  const dow = weekday(today); // 0 = Sunday
  switch (filter) {
    case "today":
      return span(today, today);
    case "tomorrow": {
      const t = addDays(today, 1);
      return span(t, t);
    }
    case "this_weekend": {
      // Fri=5, Sat=6, Sun=0 are inside the weekend in progress.
      const offsetToFri = dow === 0 ? -2 : dow === 6 ? -1 : 5 - dow;
      const fri = addDays(today, offsetToFri);
      return span(fri, addDays(fri, 2));
    }
    case "this_week": {
      // Today through Sunday.
      const toSunday = dow === 0 ? 0 : 7 - dow;
      return span(today, addDays(today, toSunday));
    }
    case "next_week": {
      // The Monday-Sunday week after this one.
      const toNextMonday = dow === 0 ? 1 : 8 - dow;
      const mon = addDays(today, toNextMonday);
      return span(mon, addDays(mon, 6));
    }
    case "specific": {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(specificDate ?? "");
      if (!m) return null;
      const d = { year: +m[1], month: +m[2], day: +m[3] };
      const check = addDays(d, 0);
      if (check.month !== d.month || check.day !== d.day) return null;
      return span(d, d);
    }
    default:
      return null;
  }
}
