import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { formatInTimeZone } from "date-fns-tz";
import { supabase } from "@/integrations/supabase/client";
import { EVENT_LIST_COLUMNS } from "@/lib/listColumns";
import { queryKeys, CACHE_TIERS } from "@/lib/queryKeys";
import { applyEventVisibility } from "@/lib/eventQuery";
import { isFreePrice } from "@/lib/eventPrice";
import { isEventOver } from "@/lib/eventTiming";
import {
  eventStartInstant,
  EVENING_START_HOUR,
  NIGHT_END_HOUR,
} from "@/lib/tonightPairings";
import {
  addCentralDays,
  centralDateOf,
  centralHour,
  centralWeekday,
  centralWindow,
  hasSpecificTime,
  upcomingFloorUtc,
  type CentralDate,
  type CentralWindow,
  type CentralWindowPreset,
} from "@/lib/timezone";
import type { Event } from "@/lib/types";
import type { IndoorFlagMap } from "@/hooks/useEventIndoorFlags";

/**
 * One query path for the date and audience landings (docs/page-plans/events.md
 * WP5): /events/today, /events/this-weekend, /events/free, /events/kids,
 * /events/date-night and /events/<month>-<year>.
 *
 * Before this each page wrote its own query, and they disagreed about what
 * "upcoming" and "visible" meant:
 *
 * - Free, Kids and Date Night floored at `now`, so an event that started at
 *   10am was gone from the list by 10:01 while it was still running.
 *   The floor is now the start of today in Central.
 * - FreeEvents skipped the merged/hidden/archived predicates, so a duplicate
 *   an admin had merged away still showed up and dead-ended on its detail page.
 * - ['events-weekend'] and ['monthly-events', slug] sat outside the events key
 *   prefix, so an admin edit never invalidated them.
 * - The month page bounded a TIMESTAMPTZ with bare dates, which drops the last
 *   evening of every month (after 7pm CDT is already the next UTC day) and
 *   pulls in the previous month's.
 */

export type LandingEvent = Event & { date: string };

export interface EventLandingOptions {
  /** What makes this landing's cache entry distinct, e.g. `{ landing: "free" }`. */
  key: Record<string, unknown>;
  /** A Central-time window. Omitted: everything from the start of today CT. */
  window?: CentralWindowPreset;
  /** A PostgREST `.or()` filter string, e.g. FREE_PRICE_FILTER. */
  or?: string;
  /** Row cap for the request. */
  limit?: number;
  enabled?: boolean;
  /**
   * Also return events that started before the window and are still running
   * at its start (end_date on or after it). Only meaningful with `window`.
   * A three-day festival that opened Thursday is part of the weekend.
   */
  includeOngoing?: boolean;
  /**
   * A lighter projection for the whole window, e.g. LANDING_LIGHT_COLUMNS
   * (events-pass2 WP3 item 7). The page then fetches full card rows for the
   * ids it renders with useLandingCards. Omitted: EVENT_LIST_COLUMNS.
   */
  columns?: string;
}

const DEFAULT_LIMIT = 100;

/**
 * What a landing needs to group, count and filter a whole window: no
 * descriptions, no image. Month (1000 rows) and Weekend (500) used to ship two
 * descriptions per row to draw 36 cards. Every name is also in
 * EVENT_LIST_COLUMNS, so nothing here can 42703 that the card query wouldn't.
 */
export const LANDING_LIGHT_COLUMNS =
  "id, title, date, event_start_utc, event_start_local, end_date, category, city, price, venue, location, source_url, is_featured, writeup_generated_at, updated_at";

/**
 * Fetch the rows for a landing page. Returns the TanStack query plus the
 * Central window it was fetched for, so a page can label "which weekend"
 * from the same bounds the rows came from.
 */
export function useEventLanding(options: EventLandingOptions) {
  const {
    key,
    window: preset,
    or,
    limit = DEFAULT_LIMIT,
    enabled = true,
    includeOngoing = false,
    columns = EVENT_LIST_COLUMNS,
  } = options;
  const now = new Date();
  const window: CentralWindow | null = preset ? centralWindow(preset, now) : null;
  const from = window ? window.start : upcomingFloorUtc(now);
  const to = window ? window.end : null;

  const query = useQuery({
    // Under queryKeys.events.list so invalidateEvents reaches every landing.
    // The bounds are in the key, so crossing midnight Central refetches.
    queryKey: queryKeys.events.list({
      ...key,
      from,
      to,
      or: or ?? null,
      limit,
      ongoing: includeOngoing && to ? true : null,
      columns: columns === EVENT_LIST_COLUMNS ? null : columns,
    }),
    queryFn: async (): Promise<LandingEvent[]> => {
      let request = applyEventVisibility(supabase.from("events").select(columns));
      const ongoing = includeOngoing && to ? ongoingStartFilter(from) : null;
      if (ongoing) {
        // One or() for both, because a second .or() is a second `or` query
        // param and PostgREST does not promise to AND duplicates.
        request = request.or(or ? `and(or(${ongoing}),or(${or}))` : ongoing);
      } else {
        request = request.gte("date", from);
        if (or) request = request.or(or);
      }
      if (to) request = request.lte("date", to);
      const { data, error } = await request
        .order("date", { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as LandingEvent[];
    },
    enabled,
    ...CACHE_TIERS.standard,
  });

  return { ...query, window };
}

/**
 * Full card rows for the ids a landing actually renders (WP3 item 7). The
 * window query carries LANDING_LIGHT_COLUMNS for every row; this fetches
 * EVENT_LIST_COLUMNS for at most a few dozen, in the order given.
 *
 * `cards` falls back to the light row for any id the full query hasn't
 * returned yet (a filter change, with the previous answer kept on screen), so
 * a card never disappears while its image and description load. `isPending`
 * is true only before the first answer, which is when a page shows skeletons.
 * On error the light rows stand: title, date, venue and price still render.
 */
export function useLandingCards(rows: readonly LandingEvent[], enabled = true) {
  const ids = rows.map((row) => row.id);
  const sortedKey = [...ids].sort();
  const query = useQuery({
    queryKey: queryKeys.events.list({ landing: "cards", ids: sortedKey }),
    queryFn: async (): Promise<LandingEvent[]> => {
      const { data, error } = await applyEventVisibility(
        supabase.from("events").select(EVENT_LIST_COLUMNS)
      ).in("id", sortedKey);
      if (error) throw error;
      return (data ?? []) as unknown as LandingEvent[];
    },
    enabled: enabled && ids.length > 0,
    placeholderData: keepPreviousData,
    ...CACHE_TIERS.standard,
  });
  const full = new Map((query.data ?? []).map((row) => [row.id, row]));
  const cards = rows.map((row) => full.get(row.id) ?? row);
  return {
    cards,
    /** True until the first full-row answer, when there are rows to fetch. */
    isPending: ids.length > 0 && query.data === undefined && !query.isError,
  };
}

/**
 * The PostgREST or() body for "starts at or after `from`, or started earlier
 * and is still running at `from`". The instant is double-quoted because it
 * holds ":" and ".", which or() otherwise reads as syntax.
 */
export function ongoingStartFilter(from: string): string {
  const at = `"${from}"`;
  return `date.gte.${at},and(date.lt.${at},end_date.gte.${at})`;
}

/**
 * is_indoor for the events in one Central window, fetched by the window's
 * bounds rather than by a list of ids (the weekend page used to send up to
 * 500 UUIDs in one `in.()` filter).
 *
 * Same degradation contract as useEventIndoorFlags: any error, including the
 * column not being deployed yet, yields an empty map, and reorderForWeather
 * then keeps the list's own order. Never a toast, never a thrown error.
 */
export function useWindowIndoorFlags(
  window: CentralWindow | null,
  enabled: boolean,
): IndoorFlagMap {
  const query = useQuery<IndoorFlagMap>({
    queryKey: ["event-indoor-flags", "window", window?.start ?? null, window?.end ?? null],
    enabled: enabled && window !== null,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<IndoorFlagMap> => {
      if (!window) return EMPTY_FLAGS;
      const { data, error } = await applyEventVisibility(
        supabase.from("events").select("id, is_indoor")
      )
        .or(ongoingStartFilter(window.start))
        .lte("date", window.end)
        .limit(INDOOR_FLAG_LIMIT);
      // Expected until the is_indoor migration is applied; a designed
      // degradation, so no handleError and no toast.
      if (error) return EMPTY_FLAGS;
      const map: Record<string, boolean | null> = {};
      // Through `unknown`: until the is_indoor migration is in the generated
      // types, the select resolves to a SelectQueryError type.
      for (const row of (data ?? []) as unknown as { id: string; is_indoor: boolean | null }[]) {
        map[row.id] = row.is_indoor ?? null;
      }
      return map;
    },
  });
  return query.data ?? EMPTY_FLAGS;
}

const EMPTY_FLAGS: IndoorFlagMap = Object.freeze({});
const INDOOR_FLAG_LIMIT = 500;

// ---------------------------------------------------------------------------
// Pure helpers the landings share. Exported for tests.
// ---------------------------------------------------------------------------

/**
 * The instant an event starts, or null when the source gave no start time:
 * time_tbd, the 19:31:58 marker, or SeatGeek's 03:30 placeholder
 * (hasSpecificTime, the rule the card and detail page use).
 */
export function landingStartInstant(event: LandingEvent): Date | null {
  if (!hasSpecificTime(event)) return null;
  return eventStartInstant({
    id: event.id,
    title: event.title ?? null,
    date: typeof event.date === "string" ? event.date : null,
    event_start_utc: event.event_start_utc ?? null,
    event_start_local: event.event_start_local ?? null,
    time_tbd: event.time_tbd ?? null,
  });
}

/** "4 PM" for 16, "4 AM" for 4, "12 AM" for 0. */
export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * The evening every landing means by "tonight": EVENING_START_HOUR to
 * NIGHT_END_HOUR Central, the same constants as the home page's rail
 * (events-pass2 WP3 item 2). Copy quotes this rather than typing the hours.
 */
export const EVENING_HOURS_LABEL = `${hourLabel(EVENING_START_HOUR)} to ${hourLabel(NIGHT_END_HOUR)}`;

/**
 * Does this event start in the evening, EVENING_START_HOUR to NIGHT_END_HOUR
 * Central? Read in Central whatever zone the browser (or the prerenderer) runs
 * in. An event with no known start time is not an evening event: its time
 * component is a placeholder, and 19:31:58 would otherwise count as a 7:31 PM
 * show.
 */
export function isEveningStart(event: LandingEvent): boolean {
  const start = landingStartInstant(event);
  if (!start) return false;
  const hour = centralHour(start);
  return hour >= EVENING_START_HOUR || hour < NIGHT_END_HOUR;
}

/** Events with a known start at or after 5 PM Central. */
export function countStartingAfter5pm(events: readonly LandingEvent[]): number {
  return events.filter((event) => {
    const start = landingStartInstant(event);
    return start !== null && centralHour(start) >= 17;
  }).length;
}

/** Events whose listed price says free. Unknown price is not free. */
export function countFree(events: readonly LandingEvent[]): number {
  return events.filter((event) => isFreePrice(event.price) === true).length;
}

/** "36" or, when the request hit its cap, "100+". Never a "+" on an exact count. */
export function countLabel(count: number, cap: number = DEFAULT_LIMIT): string {
  return count >= cap ? `${cap}+` : String(count);
}

/** The Central calendar day an event is listed on. */
export function landingDay(event: LandingEvent): CentralDate | null {
  // event_start_utc first, like the card (WP3 item 12).
  const source = event.event_start_utc || event.date;
  if (!source) return null;
  const parsed = new Date(source);
  return Number.isNaN(parsed.getTime()) ? null : centralDateOf(parsed);
}

/** Format a Central date for a heading. Noon UTC is the same date in every zone we format. */
export function formatCentralDate(day: CentralDate, pattern: string): string {
  return formatInTimeZone(new Date(`${day}T12:00:00Z`), "UTC", pattern);
}

export interface LandingGroup {
  id: string;
  label: string;
  events: LandingEvent[];
}

/** How long an event with no end_date counts as "happening now" after it starts. */
export const HAPPENING_NOW_HOURS = 3;

/**
 * Today's list, grouped by where each event sits against the clock.
 *
 * "Happening now" is an event that has started and is still running: until
 * its end_date when it has one, otherwise for three hours after the start.
 * A row that started on an EARLIER Central day is there only because it is
 * still running (includeOngoing): day 3 of a festival, or last night's show
 * still going at 1 AM. It sits under "Happening now" while it isn't over, and
 * is dropped once it is, rather than being filed as "earlier today".
 *
 * Starts from EVENING_START_HOUR are "Tonight" (WP3 item 2: one tonight, the
 * same as the home rail and Date Night). Events without a start time sit
 * under "Time not listed" rather than being guessed into a bucket. Empty
 * groups are dropped. Order within a group is kept.
 */
export function groupTodayEvents(
  events: readonly LandingEvent[],
  now: Date = new Date()
): LandingGroup[] {
  const groups: LandingGroup[] = [
    { id: "happening-now", label: "Happening now", events: [] },
    { id: "this-morning", label: "This morning", events: [] },
    { id: "this-afternoon", label: "This afternoon", events: [] },
    { id: "tonight", label: "Tonight", events: [] },
    { id: "earlier-today", label: "Earlier today", events: [] },
    { id: "time-not-listed", label: "Time not listed", events: [] },
  ];
  const byId = new Map(groups.map((g) => [g.id, g]));
  const nowMs = now.getTime();
  const today = centralDateOf(now);

  for (const event of events) {
    const day = landingDay(event);
    if (day !== null && day < today) {
      if (!isEventOver(event, now)) byId.get("happening-now")?.events.push(event);
      continue;
    }
    const start = landingStartInstant(event);
    if (!start) {
      byId.get("time-not-listed")?.events.push(event);
      continue;
    }
    if (start.getTime() <= nowMs) {
      const end = event.end_date ? new Date(event.end_date).getTime() : NaN;
      const stillOn = Number.isFinite(end)
        ? end >= nowMs
        : nowMs - start.getTime() <= HAPPENING_NOW_HOURS * 60 * 60 * 1000;
      byId.get(stillOn ? "happening-now" : "earlier-today")?.events.push(event);
      continue;
    }
    const hour = centralHour(start);
    const id =
      hour >= EVENING_START_HOUR ? "tonight" : hour >= 12 ? "this-afternoon" : "this-morning";
    byId.get(id)?.events.push(event);
  }
  return groups.filter((g) => g.events.length > 0);
}

/** The Central calendar day an event ends on, or null without a usable end_date. */
export function landingEndDay(event: LandingEvent): CentralDate | null {
  if (!event.end_date) return null;
  const parsed = new Date(event.end_date);
  return Number.isNaN(parsed.getTime()) ? null : centralDateOf(parsed);
}

/** A day on the weekend page: its own starts, then what is carried into it. */
export interface LandingDayGroup extends LandingGroup {
  /**
   * Events that started on an earlier day and are still running on this one
   * (WP3 item 8). They follow the day's own starts, so a four-day festival
   * doesn't push Saturday's shows down the page.
   */
  running: LandingEvent[];
}

/** How many carried events a day shows before "and N more running". */
export const STILL_RUNNING_CAP = 3;

/**
 * One group per Central day from `from` to `to`, empty days included, so a
 * weekend page always shows Friday, Saturday and Sunday and says when one of
 * them has nothing on.
 *
 * `carryTo` (default `from`) is the day a still-running event is listed on
 * when it started earlier: a festival that opened Thursday and runs through
 * Sunday shows on Friday, and on Saturday the page passes Saturday so it is
 * not tucked under a day that has already passed. Carried events go in
 * `running`, not `events`. An event that started before `carryTo` and ended
 * before it stays on its own day, or is dropped when that day is outside the
 * window.
 */
export function groupByCentralDay(
  events: readonly LandingEvent[],
  from: CentralDate,
  to: CentralDate,
  carryTo: CentralDate = from
): LandingDayGroup[] {
  const groups: LandingDayGroup[] = [];
  for (let day = from; day <= to; day = addCentralDays(day, 1)) {
    groups.push({
      id: day,
      label: formatCentralDate(day, "EEEE, MMM d"),
      events: [],
      running: [],
    });
  }
  const byDay = new Map(groups.map((g) => [g.id, g]));
  for (const event of events) {
    const day = landingDay(event);
    if (!day) continue;
    if (day < carryTo) {
      const endDay = landingEndDay(event);
      if (endDay && endDay >= carryTo) {
        byDay.get(carryTo)?.running.push(event);
        continue;
      }
    }
    byDay.get(day)?.events.push(event);
  }
  return groups;
}

export type DayPhase = "past" | "today" | "upcoming";

/** Where a Central day sits against today's Central date. */
export function dayPhase(day: CentralDate, today: CentralDate): DayPhase {
  if (day < today) return "past";
  return day === today ? "today" : "upcoming";
}

/**
 * Editor picks for a date window: featured events first, then events with a
 * generated write-up, each in list order (the query orders by date),
 * skipping anything already over.
 * `now` decides "over": an event counts until its end_date, or until the end
 * of its Central day when it has none.
 */
export function landingPicks(
  events: readonly LandingEvent[],
  now: Date = new Date(),
  max = 3
): LandingEvent[] {
  const today = centralDateOf(now);
  const notOver = (event: LandingEvent): boolean => {
    const end = landingEndDay(event) ?? landingDay(event);
    return end !== null && end >= today;
  };
  const featured = events.filter((e) => e.is_featured === true && notOver(e));
  const written = events.filter(
    (e) => e.is_featured !== true && !!e.writeup_generated_at && notOver(e)
  );
  return [...featured, ...written].slice(0, max);
}

/**
 * Month lists grouped by calendar week (Monday to Sunday), clipped to the
 * month, labelled with the dates the group covers ("Sep 1 - Sep 7"). Empty
 * weeks are dropped.
 *
 * `carryTo`: an event listed before that day (still running into it) is filed
 * under that day's week. The current month passes today, so a festival that
 * opened last week sits with this week rather than under a collapsed past.
 */
export function groupByWeek(
  events: readonly LandingEvent[],
  monthStart: CentralDate,
  monthEnd: CentralDate,
  carryTo?: CentralDate
): LandingGroup[] {
  const groups = new Map<string, LandingGroup>();
  for (const event of events) {
    let day = landingDay(event);
    if (!day) continue;
    if (carryTo && day < carryTo) day = carryTo;
    const monday = addCentralDays(day, -((centralWeekday(day) + 6) % 7));
    const first = monday < monthStart ? monthStart : monday;
    const sunday = addCentralDays(monday, 6);
    const last = sunday > monthEnd ? monthEnd : sunday;
    let group = groups.get(first);
    if (!group) {
      const label =
        first === last
          ? formatCentralDate(first, "MMM d")
          : `${formatCentralDate(first, "MMM d")} - ${formatCentralDate(last, "MMM d")}`;
      group = { id: `week-${first}`, label, events: [] };
      groups.set(first, group);
    }
    group.events.push(event);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, group]) => group);
}

/**
 * The current month's rows split at today (WP3 item 5). `earlier` is what was
 * listed on a day before today and isn't still running into it; `upcoming` is
 * the rest, in list order. A past or future month passes a `today` outside the
 * month and gets everything in one side, so callers only branch on the current
 * month.
 */
export function splitAtToday(
  events: readonly LandingEvent[],
  today: CentralDate
): { earlier: LandingEvent[]; upcoming: LandingEvent[] } {
  const earlier: LandingEvent[] = [];
  const upcoming: LandingEvent[] = [];
  for (const event of events) {
    const day = landingDay(event);
    const endDay = landingEndDay(event);
    if (day !== null && day < today && !(endDay !== null && endDay >= today)) {
      earlier.push(event);
    } else {
      upcoming.push(event);
    }
  }
  return { earlier, upcoming };
}

/** How many rows are listed on each Central day, for the month grid. */
export function countByCentralDay(events: readonly LandingEvent[]): Map<CentralDate, number> {
  const counts = new Map<CentralDate, number>();
  for (const event of events) {
    const day = landingDay(event);
    if (!day) continue;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Audience filters (interim, until audience columns exist: plan D4).
//
// imatch is PostgREST's ~* (case-insensitive POSIX regex). [[:<:]] and [[:>:]]
// are Postgres word boundaries, so "kids" no longer matches "kidney" and
// a bare "night" no longer qualifies an event for Date Night. The patterns
// are double-quoted because PostgREST reserves ":" and parentheses inside an
// or() value; they hold no backslashes, so nothing needs escaping inside.
// ---------------------------------------------------------------------------

const wordRe = (alternatives: string) => `"[[:<:]](${alternatives})[[:>:]]"`;

/**
 * Kids and family. Title and category match family words; the description
 * matches only plural or explicit child words, never "family" (a "family-owned
 * brewery" is not a kids event) and never a bare "kid".
 */
export const KIDS_EVENTS_FILTER = [
  `title.imatch.${wordRe("kids?|child|children|family|families|toddlers?|preschool|storytime|story time|teens?")}`,
  `category.imatch.${wordRe("kids?|family|children")}`,
  `enhanced_description.imatch.${wordRe("kids|children|toddlers")}`,
].join(",");

/**
 * Date night. Canonical categories (src/lib/eventCategories.json) plus
 * evening-out words in the title.
 */
export const DATE_NIGHT_FILTER = [
  "category.in.(Music,Comedy,Arts)",
  `title.imatch.${wordRe("concerts?|live music|wine|dinner|comedy|jazz|tasting")}`,
].join(",");
