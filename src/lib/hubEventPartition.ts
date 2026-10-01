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
 *
 * Pass 2 (docs/page-plans/explore-pass2.md WP5 items 6, 12, 13): /music's
 * tonight is tonightWindow(), the Tonight rail's evening, so a 1 AM visitor
 * still sees Friday night and not Saturday's lineup; the fetch admits rows
 * that began before the window and are still running; Saturday's weekend is
 * just Sunday and Sunday has none.
 */
import {
  addCentralDays,
  centralDateOf,
  centralWeekday,
  centralWindow,
  type CentralWindow,
} from "@/lib/timezone";
import { tonightWindow } from "@/lib/tonightPairings";
import { currentVenueName, matchVenue, normaliseVenueName } from "@/lib/venuePages";
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

/** Which weekend section a hub should render, if any. */
export type HubWeekendKind = "weekend" | "sunday" | null;

export interface HubPartition<E extends HubEventRow> {
  /** Tonight (see PartitionOptions.tonight), plus anything running now. */
  tonight: E[];
  /** The rest of this weekend, excluding tonight. Empty when not asked for. */
  weekend: E[];
  /** Everything else in the window. */
  later: E[];
  /** Ids of events running right now, for an "On now" label. */
  onNow: Set<string>;
  /**
   * "weekend" Monday to Friday, "sunday" when the evening in progress is a
   * Saturday's (only Sunday is left), null on a Sunday evening or when no
   * weekend was asked for. A null weekend's rows are in `later`, never lost.
   */
  weekendKind: HubWeekendKind;
  /** Last instant (ms) that counts as tonight. */
  tonightEndMs: number;
  /** The weekend's last Central day, when there is a weekend section. */
  weekendEndDay: string | null;
}

export interface PartitionOptions {
  /** Split out a weekend section. Music does; sports lists today then the week. */
  weekend: boolean;
  /**
   * "day": tonight is the rest of today's Central date (sports' "Today").
   * "evening": tonight is tonightWindow(now), 16:00 to 04:00, the Tonight
   * rail's definition; before 04:00 it is still the previous evening.
   */
  tonight?: "day" | "evening";
}

function startMs(event: EventTimingInput): number {
  const raw = event.event_start_utc || event.date;
  const t = raw instanceof Date ? raw.getTime() : Date.parse(raw ?? "");
  return Number.isFinite(t) ? t : Number.NaN;
}

/**
 * Split one hub query's rows into tonight / weekend / later.
 *
 * Rows keep their incoming order within each section, so pass them sorted by
 * date. A duplicate id is kept once; an event whose end has passed is dropped
 * (end_date, else start + 3h, else the end of an untimed event's day - the
 * rule in eventTiming.ts). A row that began earlier and is still running goes
 * to tonight with its id in `onNow`.
 */
export function partitionHubEvents<E extends HubEventRow>(
  events: readonly E[],
  now: Date = new Date(),
  options: PartitionOptions = { weekend: true },
): HubPartition<E> {
  const mode = options.tonight ?? "day";
  const today = centralDateOf(now);
  const evening = mode === "evening" ? tonightWindow(now) : null;
  // The day whose evening it is: yesterday before 04:00 in evening mode.
  const refDay = evening ? evening.dateKey : today;
  const refWeekday = centralWeekday(refDay);
  const weekendKind: HubWeekendKind = !options.weekend
    ? null
    : refWeekday === 0
      ? null
      : refWeekday === 6
        ? "sunday"
        : "weekend";
  const weekend = weekendKind ? centralWindow("this-weekend", new Date(`${refDay}T18:00:00Z`)) : null;
  const tonightEndMs = evening
    ? Date.parse(evening.endISO)
    : Date.parse(centralWindow("today", now).end);

  const seen = new Set<string>();
  const out: HubPartition<E> = {
    tonight: [],
    weekend: [],
    later: [],
    onNow: new Set(),
    weekendKind,
    tonightEndMs,
    weekendEndDay: weekend ? weekend.endDay : null,
  };

  for (const event of events) {
    if (!event?.id || seen.has(event.id)) continue;
    seen.add(event.id);

    const timing = eventTiming(event, now);
    if (timing.isOver) continue;
    const day = eventCentralDate(event);
    if (!day) continue;

    if (timing.tone === "now") out.onNow.add(event.id);

    const isTonight = evening
      ? out.onNow.has(event.id) || startMs(event) <= tonightEndMs || day < today
      : day <= today;

    if (isTonight) {
      out.tonight.push(event);
    } else if (weekend && day >= weekend.startDay && day <= weekend.endDay) {
      out.weekend.push(event);
    } else {
      out.later.push(event);
    }
  }
  return out;
}

/**
 * Whether a section might be missing rows because the hub query hit its row
 * cap (item 13). True when the fetch came back full and its last row starts
 * on or before the section's end: the rows the cap cut off could belong to
 * the section. When the last row is already past the section, the section is
 * complete however many rows were cut.
 */
export function sectionMayBeCut(
  rows: readonly EventTimingInput[],
  limit: number,
  sectionEndMs: number,
): boolean {
  if (rows.length < limit || rows.length === 0) return false;
  const last = startMs(rows[rows.length - 1]);
  return !Number.isFinite(last) || last <= sectionEndMs;
}

/** End of a Central day as epoch ms, for sectionMayBeCut. */
export function centralDayEndMs(day: string): number {
  return Date.parse(centralWindow({ kind: "single", date: day }).end);
}

/**
 * The hub's date clause as one PostgREST or() body: starts inside the window,
 * or started before it and its end_date is still ahead of `now` (item 12). A
 * festival that opened yesterday is on tonight, and `.gte('date', start)`
 * dropped it. Instants are double-quoted because they hold ":" and ".".
 */
export function hubDateOrFilter(windowStart: string, now: Date): string {
  const from = `"${windowStart}"`;
  return `date.gte.${from},and(date.lt.${from},end_date.gte."${now.toISOString()}")`;
}

/**
 * Category OR group and date OR group AND-ed inside one `or=` param, the way
 * eventsHubQuery nests them, so nothing depends on how PostgREST combines two
 * `or=` keys.
 */
export function hubEventsOrFilter(categoryOr: string, windowStart: string, now: Date): string {
  return `and(or(${categoryOr}),or(${hubDateOrFilter(windowStart, now)}))`;
}

// ---------------------------------------------------------------------------
// Venue matching
// ---------------------------------------------------------------------------

/** Re-exported: the one normaliser lives with the one matcher in venuePages.ts. */
export { normaliseVenueName };

/**
 * Whether an event's venue string names this venue. A wrapper over
 * matchVenue (pass 2 WP5 item 2), so the /music card, the venue page and
 * event detail agree on every row, aliases included: "Casey's Center" is the
 * arena, "Wooly's" is Woolys.
 */
export function eventAtVenue(
  eventVenue: string | null | undefined,
  venue: string | { name: string; slug?: string | null },
): boolean {
  const target = typeof venue === "string" ? { name: venue } : venue;
  return matchVenue(eventVenue, [target]) !== null;
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
export function showsByVenue<
  V extends { id: string; name: string; slug?: string | null },
  E extends { id: string; venue?: string | null },
>(
  venues: readonly V[],
  events: readonly E[],
): Map<string, VenueShows<E>> {
  const result = new Map<string, VenueShows<E>>();
  for (const venue of venues) {
    for (const event of events) {
      if (!eventAtVenue(event.venue, venue)) continue;
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

// ---------------------------------------------------------------------------
// Sports hero
// ---------------------------------------------------------------------------

/**
 * "Iowa Cubs at Principal Park; Iowa Wild, Iowa Wolves and Iowa Barnstormers
 * at Casey's Center", built from the teams rows (pass 2 WP5 item 4). The hero
 * used to hard-code it and named an arena that has since been renamed.
 */
export function teamVenueSentence(teams: readonly { name: string; venue_name: string | null }[]): string | null {
  const byVenue = new Map<string, string[]>();
  for (const team of teams) {
    const venue = currentVenueName(team.venue_name?.trim() || null);
    if (!venue) continue;
    const names = byVenue.get(venue) ?? [];
    names.push(team.name);
    byVenue.set(venue, names);
  }
  if (byVenue.size === 0) return null;
  const list = (names: string[]) =>
    names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return [...byVenue.entries()].map(([venue, names]) => `${list(names)} at ${venue}`).join('; ');
}
