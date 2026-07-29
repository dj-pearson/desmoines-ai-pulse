/**
 * Central Time (America/Chicago) helpers for the event pipeline.
 *
 * Every event in this system is a Des Moines event, and the pipeline's contract
 * is that an extracted `date` is a Central wall-clock string
 * ("YYYY-MM-DD HH:MM:SS"). Converting that to the correct UTC instant needs the
 * offset that was actually in effect on that date — CDT (-05:00) or CST
 * (-06:00) — and the DST boundary is the 2nd Sunday of March and the 1st Sunday
 * of November.
 *
 * ai-crawler used to approximate this with `month >= 2 && month <= 10`, i.e.
 * "March through November is CDT". That is wrong for the first week of March and
 * for almost all of November, so events in those windows were stored an hour
 * off — and it disagreed with firecrawl-scraper, which does the conversion
 * properly via date-fns-tz. Two ingestion paths producing different UTC values
 * for the same event also breaks the title_date_venue dedupe key.
 *
 * These helpers read the runtime's IANA tz database through Intl, so they need
 * no dependency and stay correct if the US ever changes its DST rules.
 */

export const CENTRAL_TZ = "America/Chicago";

const CENTRAL_PARTS_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: CENTRAL_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function centralParts(instant: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = CENTRAL_PARTS_FORMAT.formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const hour = get("hour");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    // Intl's hour12:false can render midnight as "24"; normalize it.
    hour: hour === 24 ? 0 : hour,
    minute: get("minute"),
    second: get("second"),
  };
}

/**
 * The UTC offset in minutes for America/Chicago at a given Central wall-clock
 * time. Returns -300 during CDT and -360 during CST.
 */
export function centralOffsetMinutes(
  year: number,
  month: number,
  day: number,
  hours = 12,
  minutes = 0,
): number {
  // Treat the wall clock as if it were UTC to get a probe instant, then measure
  // how far Chicago's rendering of that instant drifts from it. Probing at the
  // event's own hour (rather than a fixed noon) keeps the answer right for the
  // 1-2am transition hours themselves.
  const probe = Date.UTC(year, month - 1, day, hours, minutes, 0);
  const p = centralParts(new Date(probe));
  const asChicago = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asChicago - probe) / 60_000);
}

/**
 * The same offset formatted for an ISO string: "-05:00" or "-06:00".
 * Appending this to "YYYY-MM-DDTHH:MM:SS" gives a string `new Date()` parses to
 * the correct instant.
 */
export function centralOffsetString(
  year: number,
  month: number,
  day: number,
  hours = 12,
  minutes = 0,
): string {
  const offset = centralOffsetMinutes(year, month, day, hours, minutes);
  const sign = offset <= 0 ? "-" : "+";
  const abs = Math.abs(offset);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${
    String(abs % 60).padStart(2, "0")
  }`;
}

/**
 * Convert a Central wall-clock time to the UTC instant it denotes.
 * Returns null when the components don't form a real date.
 */
export function centralWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  seconds = 0,
): Date | null {
  const pad = (n: number) => String(n).padStart(2, "0");
  const offset = centralOffsetString(year, month, day, hours, minutes);
  const iso = `${year}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:${
    pad(seconds)
  }${offset}`;
  const date = new Date(iso);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Render a UTC instant as a Central wall-clock string
 * ("YYYY-MM-DD HH:MM:SS") — the shape AdapterEvent.date requires.
 */
export function centralWallClockFromUtc(instant: Date | string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const p = centralParts(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${
    pad(p.second)
  }`;
}
