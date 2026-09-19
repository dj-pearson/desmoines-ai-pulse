/**
 * Google Places opening hours and business status, normalized for storage
 * (WEB-BE-045).
 *
 * WHAT WAS MISSING. `restaurants` had no hours column in any migration and no
 * business_status, while bulk-update-restaurants already asked Places for
 * `businessStatus` in its field mask and threw the answer away. So nothing
 * ever marked a restaurant closed - a permanently closed venue stayed on the
 * hubs, in the sitemap and in the JSON-LD - and /restaurants/open-now worked
 * off `opening`, a free-text column nobody writes.
 *
 * TWO DELIBERATE OMISSIONS FROM THE STORED SHAPE:
 *
 *   openNow. Places returns it and it is true at the instant of the fetch.
 *   Storing it would put a value in the database that is wrong within hours and
 *   looks authoritative - and the only honest reader of it would have to check
 *   the timestamp first, at which point the periods are the better source.
 *
 *   secondaryOpeningHours (drive-through, delivery, happy hour). Real data, but
 *   a reader that treated them as opening hours would report a restaurant open
 *   when only its drive-through is. Out until something needs them.
 *
 * TIME ZONE. Places periods carry a local day and clock time with no zone, and
 * every row here is in America/Chicago. The zone is recorded on the object
 * rather than assumed by each reader, so a future non-Iowa row is a visible
 * mismatch instead of a silently wrong "open now".
 */

/** Bumped when the stored shape changes, so a reader can tell what it has. */
export const HOURS_JSON_VERSION = 1;

/** Every row this project stores is in Des Moines. */
export const HOURS_TIME_ZONE = "America/Chicago";

export interface PlacePeriodPoint {
  /** 0 = Sunday, per the Places API. */
  day: number;
  hour: number;
  minute: number;
}

export interface PlacePeriod {
  open: PlacePeriodPoint;
  /** Absent for a venue open 24 hours on that day. */
  close?: PlacePeriodPoint;
}

export interface StoredHours {
  version: number;
  timeZone: string;
  periods: PlacePeriod[];
  /** Google's own human-readable lines, kept for display without re-deriving. */
  weekdayDescriptions: string[];
  source: "google-places";
  fetchedAt: string;
}

/** The three values the Places API documents. Anything else is dropped. */
export const BUSINESS_STATUSES = [
  "OPERATIONAL",
  "CLOSED_TEMPORARILY",
  "CLOSED_PERMANENTLY",
] as const;

export type BusinessStatus = (typeof BUSINESS_STATUSES)[number];

/**
 * An unrecognised status is dropped rather than stored.
 *
 * A column that can hold anything Places ever invents is a column no query can
 * filter on with confidence - and the query this exists for is "hide the
 * permanently closed ones", where a value nobody anticipated must not be
 * mistaken for a closure OR for an operating venue. Null says "unknown", which
 * is the truth.
 */
export function normalizeBusinessStatus(raw: unknown): BusinessStatus | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toUpperCase();
  return (BUSINESS_STATUSES as readonly string[]).includes(value)
    ? (value as BusinessStatus)
    : null;
}

/** True when the venue is gone for good and should drop off the public surfaces. */
export function isPermanentlyClosed(status: unknown): boolean {
  return normalizeBusinessStatus(status) === "CLOSED_PERMANENTLY";
}

function validPoint(raw: unknown): PlacePeriodPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const point = raw as Record<string, unknown>;
  const day = point.day;
  const hour = point.hour;
  const minute = point.minute ?? 0;
  if (typeof day !== "number" || day < 0 || day > 6) return null;
  if (typeof hour !== "number" || hour < 0 || hour > 23) return null;
  if (typeof minute !== "number" || minute < 0 || minute > 59) return null;
  return { day, hour, minute };
}

/**
 * Places `regularOpeningHours` to the stored shape, or null.
 *
 * NULL RATHER THAN AN EMPTY OBJECT when there is nothing usable. The whole
 * point of the column is that a reader can tell "closed right now" from "we do
 * not know this venue's hours", and `{periods: []}` reads as the first while
 * meaning the second - which is how a restaurant gets published as closed
 * because Google happened not to answer.
 *
 * A period with an unusable `open` is dropped; the rest are kept. A missing
 * `close` is preserved as-is, because Places uses it for 24-hour venues and
 * inventing a closing time would be inventing a fact.
 */
export function normalizeOpeningHours(
  raw: unknown,
  fetchedAt: string = new Date().toISOString(),
): StoredHours | null {
  if (!raw || typeof raw !== "object") return null;
  const hours = raw as Record<string, unknown>;

  const periods: PlacePeriod[] = [];
  if (Array.isArray(hours.periods)) {
    for (const entry of hours.periods) {
      if (!entry || typeof entry !== "object") continue;
      const period = entry as Record<string, unknown>;
      const open = validPoint(period.open);
      if (!open) continue;
      const close = validPoint(period.close);
      periods.push(close ? { open, close } : { open });
    }
  }

  const weekdayDescriptions = Array.isArray(hours.weekdayDescriptions)
    ? hours.weekdayDescriptions.filter((d): d is string => typeof d === "string")
    : [];

  if (periods.length === 0 && weekdayDescriptions.length === 0) return null;

  return {
    version: HOURS_JSON_VERSION,
    timeZone: HOURS_TIME_ZONE,
    periods,
    weekdayDescriptions,
    source: "google-places",
    fetchedAt,
  };
}
