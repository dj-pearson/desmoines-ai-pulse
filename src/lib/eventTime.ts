/**
 * SEO-055: which day an event is on, whether it has a start time, and which
 * days it runs. One definition for every surface that buckets events by day.
 *
 * Pure, no "@/" imports and no import.meta: scripts/publish-weekend-article.ts
 * runs this under tsx, outside Vite.
 *
 * THE REPRESENTATION, and why it is not "00:00 UTC means date-only".
 *
 *   - An event's DAY is the America/Chicago calendar date of event_start_utc
 *     (falling back to `date`). That is what the slug encodes
 *     (createEventSlugWithCentralTime), what the generated column
 *     events.event_local_date holds, and what every hub filters on.
 *   - An event has NO START TIME when time_tbd is true, or when its Central
 *     wall-clock time is the ingest sentinel 19:31:58 (NO_TIME_MARKER, written
 *     by supabase/functions/_shared/eventDateTime.ts and, from SEO-055, by
 *     crawlers/catchdesmoines_crawler.py). Such an event shows its date only.
 *   - An event RUNS OVER SEVERAL DAYS when end_date falls on a later Central
 *     date than its start. It is on every day from its start through its end.
 *
 * SEO-055 was filed as "date-only rows are stored at 00:00 UTC and filed a day
 * early". The data says otherwise. On 2026-10-01, 146 of the 147 upcoming rows
 * at exactly 00:00 UTC were 19:00 Central (CDT), and the catchdesmoines
 * crawler's prompt said "Default to 19:00:00 (7 PM) if no time specified". So
 * the Central DATE on those rows is the date the source gave, and the 7 pm is
 * sometimes real (SeatGeek's own URLs say "...-2026-10-01-7-pm") and sometimes
 * the crawler's default. Reading 00:00 UTC as "all day on the UTC date" would
 * have moved every real 7 pm show to the next day. The uncorroborated 7 pm
 * rows were flagged time_tbd instead (scripts/seo-055-event-dates.sql).
 */
import { formatInTimeZone } from "date-fns-tz";

export const EVENT_TIMEZONE = "America/Chicago";

/** Central wall-clock time stamped on an event whose source gave a day but no time. */
export const NO_TIME_MARKER = "19:31:58";

export interface EventTimeFields {
  date?: string | null;
  event_start_utc?: string | null;
  time_tbd?: boolean | null;
  end_date?: string | null;
}

/** The start instant the site treats as authoritative. */
export function eventStartInstant(e: EventTimeFields): string | null {
  return e.event_start_utc || e.date || null;
}

function centralDateOf(instant: string | null | undefined): string | null {
  if (!instant) return null;
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return null;
  return formatInTimeZone(d, EVENT_TIMEZONE, "yyyy-MM-dd");
}

/** YYYY-MM-DD in America/Chicago: the day the site files this event under. */
export function eventCentralDate(e: EventTimeFields): string | null {
  return centralDateOf(eventStartInstant(e));
}

/**
 * The last Central date the event runs on, or null when it is a single-day
 * event (no end_date, or an end_date on or before its start day).
 */
export function eventCentralEndDate(e: EventTimeFields): string | null {
  const start = eventCentralDate(e);
  const end = centralDateOf(e.end_date);
  if (!start || !end || end <= start) return null;
  return end;
}

/** True when the event spans more than one Central calendar day. */
export function isMultiDay(e: EventTimeFields): boolean {
  return eventCentralEndDate(e) !== null;
}

/**
 * True only when the row carries a start time we would print. time_tbd and the
 * 19:31:58 sentinel both mean "the source gave no time"; anything else is a
 * time somebody stated.
 */
export function hasStatedStartTime(e: EventTimeFields): boolean {
  if (e.time_tbd) return false;
  const s = eventStartInstant(e);
  if (!s) return false;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return false;
  return formatInTimeZone(d, EVENT_TIMEZONE, "HH:mm:ss") !== NO_TIME_MARKER;
}

/**
 * Does the event run on any day in [firstDay, lastDay] (Central, inclusive)?
 * A single-day event is on its start date; a multi-day one on every date from
 * its start through its end date.
 */
export function eventOverlapsDays(e: EventTimeFields, firstDay: string, lastDay: string): boolean {
  const start = eventCentralDate(e);
  if (!start) return false;
  const end = eventCentralEndDate(e) ?? start;
  return start <= lastDay && end >= firstDay;
}
