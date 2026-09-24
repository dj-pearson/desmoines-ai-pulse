/**
 * One windowed query per hub, split into sections on the Central clock
 * (docs/page-plans/explore.md WP5 items 2, 4 and 6).
 *
 * /music used to run three queries (tonight, weekend, upcoming) and /sports
 * two, and the sections overlapped: tonight's show was also a weekend show and
 * an upcoming one, so the same card rendered up to three times. The weekend
 * was a hand-rolled `(5 - dow + 7) % 7`, which on a Saturday is 6 and pointed
 * at NEXT weekend while this one was in progress.
 *
 * Now each hub fetches one window and this module decides where each row goes:
 * every event lands in the first section it qualifies for, events that have
 * already ended today are dropped, and running ones are flagged "on now".
 * The weekend comes from centralWindow('this-weekend'), the same definition
 * /events and /events/this-weekend use.
 */
import {
  addCentralDays,
  centralDateOf,
  centralWindow,
  type CentralWindow,
} from "@/lib/timezone";
import {
  eventCentralDate,
  eventTiming,
  type EventTimingInput,
} from "@/lib/eventTiming";

/** Days after today each hub looks ahead. Music: two weeks. Sports: a week. */
export const MUSIC_HUB_DAYS = 14;
export const SPORTS_HUB_DAYS = 6;

/** Rows per hub query. Big enough for two weeks of shows in a metro this size. */
export const HUB_EVENT_LIMIT = 60;

export type HubEventRow = EventTimingInput & { id: string };

/** Today through today + `daysAhead`, inclusive, in Central time. */
export function hubEventWindow(daysAhead: number, now: Date = new Date()): CentralWindow {
  const today = centralDateOf(now);
  return centralWindow({ kind: "range", from: today, to: addCentralDays(today, daysAhead) }, now);
}

/** The weekend in progress on Fri-Sun, else the coming one. */
export function hubWeekend(now: Date = new Date()): CentralWindow {
  return centralWindow("this-weekend", now);
}

export interface HubPartition<E extends HubEventRow> {
  /** Starts today (or began earlier and is still running). */
  tonight: E[];
  /** Friday to Sunday of this weekend, excluding tonight. Empty when not asked for. */
  weekend: E[];
  /** Everything else in the window. */
  later: E[];
  /** Ids of events running right now, for an "On now" label. */
  onNow: Set<string>;
}

export interface PartitionOptions {
  /** Split out a weekend section. Music does; sports lists today then the week. */
  weekend: boolean;
}

/**
 * Split one hub query's rows into tonight / weekend / later.
 *
 * Rows keep their incoming order within each section, so pass them sorted by
 * date. A duplicate id is kept once; an event whose end has passed is dropped
 * (end_date, else start + 3h, else the end of an untimed event's day - the
 * rule in eventTiming.ts).
 */
export function partitionHubEvents<E extends HubEventRow>(
  events: readonly E[],
  now: Date = new Date(),
  options: PartitionOptions = { weekend: true },
): HubPartition<E> {
  const today = centralDateOf(now);
  const weekend = options.weekend ? hubWeekend(now) : null;
  const seen = new Set<string>();
  const out: HubPartition<E> = { tonight: [], weekend: [], later: [], onNow: new Set() };

  for (const event of events) {
    if (!event?.id || seen.has(event.id)) continue;
    seen.add(event.id);

    const timing = eventTiming(event, now);
    if (timing.isOver) continue;
    const day = eventCentralDate(event);
    if (!day) continue;

    if (timing.tone === "now") out.onNow.add(event.id);

    if (day <= today) {
      out.tonight.push(event);
    } else if (weekend && day >= weekend.startDay && day <= weekend.endDay) {
      out.weekend.push(event);
    } else {
      out.later.push(event);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Venue matching
// ---------------------------------------------------------------------------

/**
 * A venue name reduced to what two spellings of it share: lower case, "&" as
 * "and", punctuation gone, a leading "the" dropped. "The Lift" and "Lift",
 * "Hoyt Sherman Place" and "Hoyt Sherman Place." then compare equal.
 */
export function normaliseVenueName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "")
    .replace(/\s+/g, " ");
}

/**
 * Whether an event's venue string names this venue. Equal after
 * normalising, or the event's string starts with the venue's name followed by
 * more words ("Wells Fargo Arena - Des Moines"). Deliberately nothing looser:
 * a wrong "Next:" line is worse than none.
 */
export function eventAtVenue(eventVenue: string | null | undefined, venueName: string): boolean {
  const e = normaliseVenueName(eventVenue);
  const v = normaliseVenueName(venueName);
  if (!e || !v) return false;
  return e === v || e.startsWith(`${v} `);
}

export interface VenueShows<E> {
  /** The soonest show at the venue that hasn't ended. */
  next: E;
  /** Shows at the venue in the loaded window. */
  count: number;
}

/**
 * For each venue, its next show and how many it has in the loaded events.
 * `events` should already be partitioned (ended rows dropped) and in date
 * order; the first match per venue is its next show. Venues with no match are
 * absent from the map.
 */
export function showsByVenue<V extends { id: string; name: string }, E extends { id: string; venue?: string | null }>(
  venues: readonly V[],
  events: readonly E[],
): Map<string, VenueShows<E>> {
  const result = new Map<string, VenueShows<E>>();
  for (const venue of venues) {
    for (const event of events) {
      if (!eventAtVenue(event.venue, venue.name)) continue;
      const current = result.get(venue.id);
      if (current) current.count += 1;
      else result.set(venue.id, { next: event, count: 1 });
    }
  }
  return result;
}

/** Venues with shows first, each group keeping its incoming (alphabetical) order. */
export function sortVenuesByShows<V extends { id: string }>(
  venues: readonly V[],
  shows: ReadonlyMap<string, unknown>,
): V[] {
  const withShows = venues.filter((v) => shows.has(v.id));
  const without = venues.filter((v) => !shows.has(v.id));
  return [...withShows, ...without];
}
