/**
 * WEB-ADS-048: the owner's weekly hours form, as a model the form edits and
 * the periods update_claimed_listing takes.
 *
 * The database rebuilds the stored object itself (owner_hours_json in
 * migration 20261121000150): it validates the periods again, sorts them,
 * writes the weekday lines and marks the source as 'owner'. This module only
 * turns times typed into a form into the Places period shape and catches the
 * mistakes worth catching before a round trip.
 */

/** 0 = Sunday, as in the Places API and hours_json. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Monday first, the order Google's weekday lines use and the form shows. */
export const WEEK_ORDER: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export const WEEKDAY_NAMES: Record<Weekday, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

/** The most opening times the form offers on one day (lunch and dinner). */
export const MAX_RANGES_PER_DAY = 2;

export interface TimeRange {
  /** "HH:MM", 24-hour, as an <input type="time"> gives it. */
  open: string;
  close: string;
}

export interface DayHours {
  closed: boolean;
  ranges: TimeRange[];
}

export type WeekHours = Record<Weekday, DayHours>;

export interface PeriodPoint {
  day: number;
  hour: number;
  minute: number;
}

export interface OwnerPeriod {
  open: PeriodPoint;
  close: PeriodPoint;
}

export type WeekToPeriodsResult =
  | { ok: true; periods: OwnerPeriod[] }
  | { ok: false; error: string; day?: Weekday };

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseTime(value: string): { hour: number; minute: number } | null {
  const m = TIME.exec(value.trim());
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

function emptyWeek(): WeekHours {
  return {
    0: { closed: true, ranges: [] },
    1: { closed: true, ranges: [] },
    2: { closed: true, ranges: [] },
    3: { closed: true, ranges: [] },
    4: { closed: true, ranges: [] },
    5: { closed: true, ranges: [] },
    6: { closed: true, ranges: [] },
  };
}

function isPoint(raw: unknown): raw is PeriodPoint {
  if (!raw || typeof raw !== "object") return false;
  const p = raw as Record<string, unknown>;
  return (
    typeof p.day === "number" &&
    Number.isInteger(p.day) &&
    p.day >= 0 &&
    p.day <= 6 &&
    typeof p.hour === "number" &&
    p.hour >= 0 &&
    p.hour <= 23 &&
    (p.minute === undefined || (typeof p.minute === "number" && p.minute >= 0 && p.minute <= 59))
  );
}

/**
 * The form's starting state from a stored hours_json (Google's or the
 * owner's). A day with no usable period starts as closed; a period with no
 * close (Google's 24-hour marker) is skipped rather than invented. A day
 * with more periods than the form offers keeps the first ones.
 */
export function weekFromStoredHours(hoursJson: unknown): WeekHours {
  const week = emptyWeek();
  const periods = (hoursJson as { periods?: unknown } | null | undefined)?.periods;
  if (!Array.isArray(periods)) return week;
  const sorted = periods
    .filter((p): p is OwnerPeriod => !!p && isPoint((p as OwnerPeriod).open) && isPoint((p as OwnerPeriod).close))
    .sort((a, b) => a.open.day - b.open.day || a.open.hour - b.open.hour || (a.open.minute ?? 0) - (b.open.minute ?? 0));
  for (const p of sorted) {
    const day = week[p.open.day as Weekday];
    if (day.ranges.length >= MAX_RANGES_PER_DAY) continue;
    day.closed = false;
    day.ranges.push({
      open: `${pad(p.open.hour)}:${pad(p.open.minute ?? 0)}`,
      close: `${pad(p.close.hour)}:${pad(p.close.minute ?? 0)}`,
    });
  }
  return week;
}

/**
 * The periods update_claimed_listing takes, or the first problem a person
 * can fix. A closing time at or before the opening time means the place
 * closes after midnight (5 PM to 1:30 AM), which is how bars are open.
 */
export function weekToPeriods(week: WeekHours): WeekToPeriodsResult {
  const periods: OwnerPeriod[] = [];
  for (const day of WEEK_ORDER) {
    const hours = week[day];
    if (hours.closed) continue;
    if (hours.ranges.length === 0) {
      return { ok: false, day, error: `Add an opening time for ${WEEKDAY_NAMES[day]}, or mark it closed.` };
    }
    const spans: Array<[number, number]> = [];
    for (const range of hours.ranges) {
      const open = parseTime(range.open);
      const close = parseTime(range.close);
      if (!open || !close) {
        return { ok: false, day, error: `Enter both an opening and a closing time for ${WEEKDAY_NAMES[day]}.` };
      }
      const start = open.hour * 60 + open.minute;
      const endOfDay = close.hour * 60 + close.minute;
      const overnight = endOfDay <= start;
      spans.push([start, overnight ? endOfDay + 1440 : endOfDay]);
      periods.push({
        open: { day, hour: open.hour, minute: open.minute },
        close: { day: overnight ? (day + 1) % 7 : day, hour: close.hour, minute: close.minute },
      });
    }
    spans.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < spans.length; i++) {
      if (spans[i][0] < spans[i - 1][1]) {
        return { ok: false, day, error: `The opening times on ${WEEKDAY_NAMES[day]} overlap.` };
      }
    }
  }
  if (periods.length === 0) {
    return {
      ok: false,
      error: "Add at least one day you are open. If the place is closed, use the status section instead.",
    };
  }
  return { ok: true, periods };
}

/** True when the stored hours were set by the owner (hours_json.source). */
export function isOwnerHours(hoursJson: unknown): boolean {
  return (hoursJson as { source?: unknown } | null | undefined)?.source === "owner";
}
