import { useQuery } from "@tanstack/react-query";
import { formatInTimeZone } from "date-fns-tz";
import { supabase } from "@/integrations/supabase/client";
import { EVENT_LIST_COLUMNS } from "@/lib/listColumns";
import { queryKeys, CACHE_TIERS } from "@/lib/queryKeys";
import { applyEventVisibility } from "@/lib/eventQuery";
import { isFreePrice } from "@/lib/eventPrice";
import { eventStartInstant } from "@/lib/tonightPairings";
import {
  addCentralDays,
  centralDateOf,
  centralHour,
  centralWeekday,
  centralWindow,
  upcomingFloorUtc,
  type CentralDate,
  type CentralWindow,
  type CentralWindowPreset,
} from "@/lib/timezone";
import type { Event } from "@/lib/types";

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
}

const DEFAULT_LIMIT = 100;

/**
 * Fetch the rows for a landing page. Returns the TanStack query plus the
 * Central window it was fetched for, so a page can label "which weekend"
 * from the same bounds the rows came from.
 */
export function useEventLanding(options: EventLandingOptions) {
  const { key, window: preset, or, limit = DEFAULT_LIMIT, enabled = true } = options;
  const now = new Date();
  const window: CentralWindow | null = preset ? centralWindow(preset, now) : null;
  const from = window ? window.start : upcomingFloorUtc(now);
  const to = window ? window.end : null;

  const query = useQuery({
    // Under queryKeys.events.list so invalidateEvents reaches every landing.
    // The bounds are in the key, so crossing midnight Central refetches.
    queryKey: queryKeys.events.list({ ...key, from, to, or: or ?? null, limit }),
    queryFn: async (): Promise<LandingEvent[]> => {
      let request = applyEventVisibility(
        supabase.from("events").select(EVENT_LIST_COLUMNS)
      ).gte("date", from);
      if (to) request = request.lte("date", to);
      if (or) request = request.or(or);
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

// ---------------------------------------------------------------------------
// Pure helpers the landings share. Exported for tests.
// ---------------------------------------------------------------------------

/** The instant an event starts, or null when the source gave no start time. */
export function landingStartInstant(event: LandingEvent): Date | null {
  return eventStartInstant({
    id: event.id,
    title: event.title ?? null,
    date: typeof event.date === "string" ? event.date : null,
    event_start_utc: event.event_start_utc ?? null,
    event_start_local: event.event_start_local ?? null,
    time_tbd: event.time_tbd ?? null,
  });
}

/**
 * Does this event start in the evening, 5 PM to 2 AM Central? Read in Central
 * whatever zone the browser (or the prerenderer) runs in. An event with no
 * known start time is not an evening event: its time component is a
 * placeholder, and 19:31:58 would otherwise count as a 7:31 PM show.
 */
export function isEveningStart(event: LandingEvent): boolean {
  const start = landingStartInstant(event);
  if (!start) return false;
  const hour = centralHour(start);
  return hour >= 17 || hour < 2;
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
  const source = event.date || event.event_start_utc;
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
 * "Happening now" is an event that has started and is still running: until its
 * end_date when it has one, otherwise for three hours after the start. Events
 * without a start time sit under "Time not listed" rather than being guessed
 * into a bucket. Empty groups are dropped. Order within a group is kept.
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

  for (const event of events) {
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
    const id = hour >= 17 ? "tonight" : hour >= 12 ? "this-afternoon" : "this-morning";
    byId.get(id)?.events.push(event);
  }
  return groups.filter((g) => g.events.length > 0);
}

/**
 * One group per Central day from `from` to `to`, empty days included, so a
 * weekend page always shows Friday, Saturday and Sunday and says when one of
 * them has nothing on.
 */
export function groupByCentralDay(
  events: readonly LandingEvent[],
  from: CentralDate,
  to: CentralDate
): LandingGroup[] {
  const groups: LandingGroup[] = [];
  for (let day = from; day <= to; day = addCentralDays(day, 1)) {
    groups.push({ id: day, label: formatCentralDate(day, "EEEE, MMM d"), events: [] });
  }
  const byDay = new Map(groups.map((g) => [g.id, g]));
  for (const event of events) {
    const day = landingDay(event);
    if (day) byDay.get(day)?.events.push(event);
  }
  return groups;
}

/**
 * Month lists grouped by calendar week (Monday to Sunday), clipped to the
 * month, labelled with the dates the group covers ("Sep 1 - Sep 7"). Empty
 * weeks are dropped.
 */
export function groupByWeek(
  events: readonly LandingEvent[],
  monthStart: CentralDate,
  monthEnd: CentralDate
): LandingGroup[] {
  const groups = new Map<string, LandingGroup>();
  for (const event of events) {
    const day = landingDay(event);
    if (!day) continue;
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
