/**
 * What a series page shows, from that series' `events` rows (SEO-043).
 *
 * Pure: rows in, view out, so the selection rules have tests rather than a
 * reading. The rows come from useEventSeriesPage, which reads merged rows out
 * and everything else in, because a past edition is exactly the row the
 * visibility predicates exist to hide. Which of those rows may appear, and
 * which may be linked, is decided here:
 *
 *   visible (not hidden, not archived)  listed and linked
 *   archived_at set                     listed and linked; the detail page
 *                                       renders it as a past event, noindex
 *   hidden by the stale sweep           listed, NOT linked: its URL is the
 *                                       "Event Not Found" page now
 *   hidden by a moderator               left out entirely
 *
 * The sweep and a moderator both set is_hidden. They are told apart by
 * hidden_at: hide_stale_events only hides a row whose date has passed, so a
 * row hidden on or before its own Central date was taken down by a person.
 * Measured 2026-10-01: all 901 hidden rows were hidden after their date.
 */
import { BRAND } from "@/lib/brandConfig";
import { buildEventLocation, eventEndIso, eventPageUrl, eventStartIso } from "@/lib/eventSchema";
import { eventCentralDate, eventEnd, isEventOver } from "@/lib/eventTiming";
import { centralDateOf, createEventSlugWithCentralTime, formatInCentralTime } from "@/lib/timezone";
import { officialSeriesUrl, seriesForEvent, seriesPath, type EventSeriesDef } from "@/lib/eventSeries";
import type { Event } from "@/lib/types";

/** A series row: the list columns plus the switches this module reads. */
export type SeriesEventRow = Event & {
  is_hidden?: boolean | null;
  hidden_at?: string | null;
  archived_at?: string | null;
  source_url_broken?: boolean | null;
};

export interface SeriesInstance {
  row: SeriesEventRow;
  /** Central yyyy-MM-dd of the start. */
  day: string;
  /** /events/<slug>, or null when that URL no longer resolves. */
  href: string | null;
  isOver: boolean;
}

export interface SeriesEdition {
  year: number;
  /** One per Central day, soonest first. */
  instances: SeriesInstance[];
  /** Distinct venue names, in order of first appearance. */
  venues: string[];
  /** Central yyyy-MM-dd of the first instance. */
  firstDay: string;
  /** Central yyyy-MM-dd the edition ends: the last instance, or a later end_date. */
  lastDay: string;
}

export interface SeriesView {
  /** The edition with something still to come, or null. */
  current: SeriesEdition | null;
  /** Every other edition, newest first. */
  past: SeriesEdition[];
  /**
   * The year whose date we do not have, when no edition is current: the year
   * after the latest edition, or this year if that is later. Null when there
   * is a current edition.
   */
  unannouncedYear: number | null;
  /** The organiser's link from the stored rows, or null. */
  officialUrl: string | null;
  /** The newest edition's first venue, for the page summary. */
  venue: string | null;
  total: number;
}

/** True when a person, not the stale sweep, hid this row. */
export function isModeratorHidden(row: SeriesEventRow): boolean {
  if (!row.is_hidden) return false;
  const day = eventCentralDate(row);
  if (!row.hidden_at || !day) return true;
  // The sweep hides only rows whose date has passed: hidden after the event's
  // own Central day means the sweep.
  return centralDateOf(row.hidden_at) <= day;
}

/** The detail URL still renders this row (live, or archived as a past event). */
export function isLinkable(row: SeriesEventRow): boolean {
  return !row.is_hidden;
}

/**
 * The Central day a row's stated end_date falls on, or null without one. Only
 * a real end_date counts: a timed row's assumed three-hour end could cross
 * midnight and invent a second day.
 */
function runEndDay(row: SeriesEventRow): string | null {
  if (!row.end_date) return null;
  const end = eventEnd(row);
  return end ? centralDateOf(end) : null;
}

/** Live rows win a day, then the shorter title ("Hinterland 2026 Music Festival" over a day-pass row). */
function preferred(a: SeriesEventRow, b: SeriesEventRow): SeriesEventRow {
  const live = (r: SeriesEventRow) => (!r.is_hidden && !r.archived_at ? 0 : r.is_hidden ? 2 : 1);
  if (live(a) !== live(b)) return live(a) < live(b) ? a : b;
  return (a.title?.length ?? 0) <= (b.title?.length ?? 0) ? a : b;
}

/**
 * Group a series' rows into editions by Central year and pick the current one.
 *
 * `def` filters again (the database query is a loose ilike), so a row whose
 * title only resembles the series - "Backyard BBQ Contest at Beaverdale Fall
 * Festival" - is not counted as an edition of it.
 */
export function buildSeriesView(
  def: EventSeriesDef,
  rows: readonly SeriesEventRow[],
  now: Date = new Date(),
): SeriesView {
  const members = rows.filter((row) => seriesForEvent(row)?.slug === def.slug && !isModeratorHidden(row));

  const byDay = new Map<string, SeriesEventRow>();
  for (const row of members) {
    const day = eventCentralDate(row);
    if (!day) continue;
    const held = byDay.get(day);
    byDay.set(day, held ? preferred(held, row) : row);
  }

  const instances: SeriesInstance[] = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, row]) => ({
      row,
      day,
      href: isLinkable(row) ? `/events/${createEventSlugWithCentralTime(row.title, row)}` : null,
      isOver: isEventOver(row, now),
    }));

  const editions = new Map<number, SeriesEdition>();
  for (const instance of instances) {
    const year = Number(instance.day.slice(0, 4));
    const edition =
      editions.get(year) ?? { year, instances: [], venues: [], firstDay: instance.day, lastDay: instance.day };
    edition.instances.push(instance);
    const venue = instance.row.venue?.trim() || instance.row.location?.trim();
    if (venue && !edition.venues.includes(venue)) edition.venues.push(venue);
    const until = runEndDay(instance.row) ?? instance.day;
    if (until > edition.lastDay) edition.lastDay = until;
    editions.set(year, edition);
  }
  const ordered = [...editions.values()].sort((a, b) => a.year - b.year);

  // Current: the earliest edition with a live date still to come. A stale-
  // hidden row is over by construction, so `!isOver` already excludes it.
  const current =
    ordered.find((e) => e.instances.some((i) => !i.isOver && !i.row.is_hidden && !i.row.archived_at)) ?? null;
  const past = ordered.filter((e) => e !== current).reverse();

  const thisYear = Number(centralDateOf(now).slice(0, 4));
  const latest = ordered[ordered.length - 1];
  const unannouncedYear = current ? null : Math.max(latest ? latest.year + 1 : thisYear, thisYear);

  const newestFirst = [...members].sort((a, b) => {
    const da = eventCentralDate(a) ?? "";
    const db = eventCentralDate(b) ?? "";
    return da < db ? 1 : da > db ? -1 : 0;
  });

  const venueSource = current ?? past[0] ?? null;

  return {
    current,
    past,
    unannouncedYear,
    officialUrl: officialSeriesUrl(def, newestFirst),
    venue: venueSource?.venues[0] ?? null,
    total: instances.length,
  };
}

/** A Central yyyy-MM-dd in words. 17:00 UTC is noon or 11 am Central, clear of DST edges. */
export function centralDayWords(day: string, pattern = "EEEE, MMMM d, yyyy"): string {
  return formatInCentralTime(new Date(`${day}T17:00:00Z`), pattern);
}

/**
 * "Friday, October 2, 2026", or "Thursday, July 30 to Sunday, August 2, 2026"
 * for an edition over several days.
 */
export function editionDateLabel(edition: Pick<SeriesEdition, "firstDay" | "lastDay">): string {
  if (edition.firstDay === edition.lastDay) return centralDayWords(edition.firstDay);
  const sameYear = edition.firstDay.slice(0, 4) === edition.lastDay.slice(0, 4);
  const from = centralDayWords(edition.firstDay, sameYear ? "EEEE, MMMM d" : "EEEE, MMMM d, yyyy");
  return `${from} to ${centralDayWords(edition.lastDay)}`;
}

/** "2027 date not announced yet": the line a page shows when no edition is current. */
export function unannouncedLabel(year: number): string {
  return `${year} date not announced yet`;
}

export function seriesPageUrl(def: EventSeriesDef): string {
  return `${BRAND.baseUrl}${seriesPath(def)}`;
}

/**
 * EventSeries JSON-LD. Each edition's dates are subEvents; one with a live
 * detail page references that page's Event node by @id (the Event schema
 * itself stays on the instance page), and one whose URL is gone carries its
 * date and place only, so no subEvent points at a not-found page.
 */
export function buildEventSeriesJsonLd(def: EventSeriesDef, view: SeriesView) {
  const url = seriesPageUrl(def);
  const editions = [...(view.current ? [view.current] : []), ...view.past];
  const subEvent = editions.flatMap((edition) =>
    edition.instances.map(({ row, href }) => {
      const endDate = eventEndIso(row);
      const pageUrl = href ? eventPageUrl(row) : null;
      return {
        "@type": "Event" as const,
        ...(pageUrl ? { "@id": `${pageUrl}#event`, url: pageUrl } : {}),
        name: row.title,
        startDate: eventStartIso(row),
        ...(endDate ? { endDate } : {}),
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        eventStatus: "https://schema.org/EventScheduled",
        location: buildEventLocation(row),
      };
    }),
  );
  const newest = editions[0]?.instances[0]?.row;
  return {
    "@context": "https://schema.org",
    "@type": "EventSeries" as const,
    "@id": `${url}#series`,
    name: def.name,
    description: def.about,
    url,
    ...(newest ? { location: buildEventLocation(newest) } : {}),
    ...(view.officialUrl ? { sameAs: [view.officialUrl] } : {}),
    ...(subEvent.length > 0 ? { subEvent } : {}),
  };
}
