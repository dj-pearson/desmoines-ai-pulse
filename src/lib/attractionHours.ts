/**
 * Open status and a weekly table from attractions.hours (Explore plan WP3 item 3).
 *
 * attractions.hours is JSONB shaped `{ mon: { open, close }, tue: ..., ... }`
 * (migration 20260520000004). The detail page used to hand that object to
 * OpenStatusChip, whose parser only reads strings, so every attraction read
 * "check official site" no matter what the admin had entered.
 *
 * This converts the stored object into the `periods` shape restaurantHours.ts
 * already evaluates, and calls resolveOpenStatus with hours_summary as the
 * text fallback. restaurantHours.ts is imported, never edited (it belongs to
 * the eat-drink plan).
 *
 * A MISSING DAY IS NOT A CLOSED DAY. `{ mon: {...}, tue: {...} }` says nothing
 * about Wednesday, so:
 *   - today missing           -> the hours_summary text decides, or unknown;
 *   - today present, some other day missing -> today's status stands, but a
 *     "Closed, opens Thu 9 AM" is cut back to "Closed", because the next
 *     opening could be on the day nobody entered.
 * A day is closed only when it says so: `null`, `false`, `"closed"`, or an
 * object with `closed: true`.
 */
import {
  desMoinesNow,
  formatClockLabel,
  resolveOpenStatus,
  type RestaurantOpenResult,
  type StoredOpeningHours,
} from "@/lib/restaurantHours";

/** Monday first, the order a visitor reads a week in. */
const WEEK: ReadonlyArray<{ key: string; label: string; day: number }> = [
  { key: "mon", label: "Monday", day: 1 },
  { key: "tue", label: "Tuesday", day: 2 },
  { key: "wed", label: "Wednesday", day: 3 },
  { key: "thu", label: "Thursday", day: 4 },
  { key: "fri", label: "Friday", day: 5 },
  { key: "sat", label: "Saturday", day: 6 },
  { key: "sun", label: "Sunday", day: 0 },
];

type DayHours =
  | { kind: "open"; openMinute: number; closeMinute: number }
  | { kind: "closed" }
  | { kind: "missing" };

export interface WeeklyHoursRow {
  label: string;
  /** "9 AM - 5 PM", "Closed", or null when the day was never entered. */
  text: string | null;
  isToday: boolean;
}

/**
 * Minutes after midnight for "09:00", "9:00", "17:30", "24:00", "9am",
 * "9:30 PM". Null for anything else.
 */
export function parseClock(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const s = value.trim().toLowerCase().replace(/\./g, "");
  const m = /^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?$/.exec(s);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3];
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (hour === 12) hour = 0;
    if (meridiem === "pm") hour += 12;
  } else if (!m[2]) {
    // A bare "9" with no minutes and no am/pm has two readings.
    return null;
  }
  if (hour > 24 || (hour === 24 && minute !== 0)) return null;
  return hour * 60 + minute;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The stored object keyed by three-letter day, whatever case or length the admin used. */
function normaliseKeys(hours: unknown): Record<string, unknown> | null {
  if (!isRecord(hours)) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(hours)) {
    out[key.trim().toLowerCase().slice(0, 3)] = value;
  }
  return out;
}

function readDay(raw: Record<string, unknown> | null, key: string): DayHours {
  if (!raw || !(key in raw)) return { kind: "missing" };
  const value = raw[key];
  if (value === null || value === false) return { kind: "closed" };
  if (typeof value === "string") {
    return value.trim().toLowerCase() === "closed" ? { kind: "closed" } : { kind: "missing" };
  }
  if (!isRecord(value)) return { kind: "missing" };
  if (value.closed === true) return { kind: "closed" };
  const openMinute = parseClock(value.open);
  const closeMinute = parseClock(value.close);
  if (openMinute === null || closeMinute === null || openMinute >= 24 * 60) {
    return { kind: "missing" };
  }
  return { kind: "open", openMinute, closeMinute };
}

/** The stored hours as the `periods` shape resolveOpenStatus reads. */
export function attractionHoursToPeriods(hours: unknown): StoredOpeningHours["periods"] {
  const raw = normaliseKeys(hours);
  const periods: NonNullable<StoredOpeningHours["periods"]> = [];
  for (const { key, day } of WEEK) {
    const d = readDay(raw, key);
    if (d.kind !== "open") continue;
    const overnight = d.closeMinute <= d.openMinute;
    periods.push({
      open: { day, hour: Math.floor(d.openMinute / 60), minute: d.openMinute % 60 },
      // A close at or before the open is the next morning (a 20:00-02:00
      // evening), and 24:00 is midnight at the end of the same day.
      close: {
        day: overnight ? (day + 1) % 7 : day,
        hour: Math.floor(d.closeMinute / 60),
        minute: d.closeMinute % 60,
      },
    });
  }
  return periods;
}

/** Which WEEK key is today in Des Moines. */
function todayKey(now: Date): string {
  const day = desMoinesNow(now).getDay();
  return WEEK.find((w) => w.day === day)?.key ?? "mon";
}

/**
 * Today's open status for an attraction, from the structured hours when they
 * cover today, from hours_summary otherwise.
 */
export function attractionOpenStatus(
  hours: unknown,
  hoursSummary: string | null | undefined,
  now: Date = new Date(),
): RestaurantOpenResult {
  const raw = normaliseKeys(hours);
  const days = WEEK.map((w) => readDay(raw, w.key));
  const today = readDay(raw, todayKey(now));

  if (today.kind === "missing") {
    return resolveOpenStatus(null, hoursSummary, now);
  }

  const periods = attractionHoursToPeriods(hours) ?? [];
  if (periods.length === 0) {
    // Today is entered as closed and no day has hours. That is still a real
    // answer for today, with no next opening to name.
    return {
      status: "closed",
      isOpen: false,
      closingSoon: false,
      closesAt: null,
      nextOpensAt: null,
      nextOpensInMinutes: null,
    };
  }

  const result = resolveOpenStatus({ periods }, hoursSummary, now);
  const complete = days.every((d) => d.kind !== "missing");
  if (!complete && result.status === "closed") {
    return { ...result, nextOpensAt: null, nextOpensInMinutes: null };
  }
  return result;
}

function formatRange(openMinute: number, closeMinute: number): string {
  if (openMinute === 0 && (closeMinute === 24 * 60 || closeMinute === 0)) return "Open 24 hours";
  return `${formatClockLabel(openMinute)} - ${formatClockLabel(closeMinute % (24 * 60))}`;
}

/**
 * Seven rows, Monday first, for the detail page's hours table. Empty when the
 * row has no readable day at all, so the caller renders no table rather than
 * seven blanks.
 */
export function weeklyHoursRows(hours: unknown, now: Date = new Date()): WeeklyHoursRow[] {
  const raw = normaliseKeys(hours);
  const today = todayKey(now);
  const rows = WEEK.map(({ key, label }) => {
    const d = readDay(raw, key);
    const text =
      d.kind === "open" ? formatRange(d.openMinute, d.closeMinute) : d.kind === "closed" ? "Closed" : null;
    return { label, text, isToday: key === today };
  });
  return rows.some((r) => r.text !== null) ? rows : [];
}
