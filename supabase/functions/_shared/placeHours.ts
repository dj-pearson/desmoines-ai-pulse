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

/**
 * SEO-054. The Place Details field mask for an hours-only refresh.
 *
 * bulk-update-restaurants' full mask also asks for editorialSummary, photos,
 * rating, phone and website, and writes them: description, image and contact
 * fields get overwritten on every row it touches. Filling hours for rows that
 * are already enriched must not rewrite their descriptions, so the hours-only
 * mode asks for these two fields and writes these two columns.
 */
export const HOURS_ONLY_FIELD_MASK = "regularOpeningHours,businessStatus";

export interface HoursOnlyUpdate {
  hours_json?: StoredHours;
  business_status?: BusinessStatus;
}

/**
 * The columns an hours-only refresh writes for one Place Details response, or
 * null when Places gave neither usable hours nor a recognised status. Nothing
 * else in the response is read, so nothing else can be written.
 */
export function buildHoursOnlyUpdate(
  details: unknown,
  fetchedAt: string = new Date().toISOString(),
): HoursOnlyUpdate | null {
  if (!details || typeof details !== "object") return null;
  const place = details as Record<string, unknown>;
  const update: HoursOnlyUpdate = {};
  const hours = normalizeOpeningHours(place.regularOpeningHours, fetchedAt);
  if (hours) update.hours_json = hours;
  const status = normalizeBusinessStatus(place.businessStatus);
  if (status) update.business_status = status;
  return Object.keys(update).length > 0 ? update : null;
}

/**
 * WEB-FEAT-079. Re-reading hours that are already stored.
 *
 * THE GAP. Every writer of hours_json fills a row once: the hours-only mode
 * targets `hours_json IS NULL`, and the full enrichment skips rows whose
 * `enhanced` is 'completed'. So a place that changed its hours, or that Google
 * now marks CLOSED_TEMPORARILY / CLOSED_PERMANENTLY, kept the answer from the
 * day it was first filled. Every open-now badge and every closed-place filter
 * on the site reads those two columns, so their accuracy decayed with the age
 * of the fetch.
 *
 * `staleDays` on the hours-only request turns it into a refresh of rows whose
 * last check is older than that many days. "Last check" is
 * restaurants.hours_checked_at, written on every answer Places gives, so a
 * place Google no longer has hours for (or no longer knows) is not re-read at
 * the head of every batch. A row the fill mode wrote before that column
 * existed has no check time; its hours_json.fetchedAt stands in.
 */
export const HOURS_STALE_MIN_DAYS = 7;
export const HOURS_STALE_MAX_DAYS = 365;

/**
 * The requested staleness window in whole days, or null for "not a refresh".
 * Out-of-range values are clamped rather than refused: the caller asked for a
 * refresh, and a window under a week would re-buy the same Place Details
 * answers for no new information.
 */
export function parseStaleDays(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === false) return null;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.max(n, HOURS_STALE_MIN_DAYS), HOURS_STALE_MAX_DAYS);
}

/** The ISO instant before which a check counts as stale. */
export function staleHoursCutoff(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * PostgREST `or` for "checked before the cutoff, or never checked and fetched
 * before it". Both values are ISO-8601 UTC strings, so the text comparison on
 * hours_json->>fetchedAt orders the same way the instants do.
 */
export function staleHoursFilter(cutoffIso: string): string {
  return `hours_checked_at.lt.${cutoffIso},and(hours_checked_at.is.null,hours_json->>fetchedAt.lt.${cutoffIso})`;
}

export interface StaleRefreshUpdate extends HoursOnlyUpdate {
  hours_checked_at: string;
}

/**
 * The columns a refresh writes for one Place Details answer. Always records
 * the check. Writes hours and status only when Places gave usable ones, so a
 * response without hours never blanks hours the row already has: null hours
 * mean "unknown", and the stored ones still say when they were fetched.
 */
export function buildStaleRefreshUpdate(
  details: unknown,
  checkedAt: string = new Date().toISOString(),
): StaleRefreshUpdate {
  return { ...(buildHoursOnlyUpdate(details, checkedAt) ?? {}), hours_checked_at: checkedAt };
}

/**
 * Whether a failed Place Details call still counts as a check. 404 is Google
 * saying the place id is gone, an answer that will not change on retry; a
 * quota, auth or server error says nothing about the place and is retried on
 * the next run.
 */
export function failedLookupCountsAsCheck(status: number): boolean {
  return status === 404;
}
