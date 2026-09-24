import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EVENT_LIST_COLUMNS } from "@/lib/listColumns";
import { queryKeys } from "@/lib/queryKeys";
import { applyEventVisibility, filterVisibleIds } from "@/lib/eventQuery";
import { applyEventArea, eventInArea, type EventArea } from "@/lib/eventAreas";
import { FREE_PRICE_FILTER, isFreePrice } from "@/lib/eventPrice";
import {
  addCentralDays,
  centralDateOf,
  centralHour,
  centralWindow,
  upcomingFloorUtc,
  type CentralWindow,
  type CentralWindowPreset,
} from "@/lib/timezone";
import type { Event } from "@/lib/types";

/**
 * The /events hub's query, in one place (docs/page-plans/events.md WP1).
 *
 * Before this the hub compared a TIMESTAMPTZ to a UTC calendar date, so
 * "Today" missed every show after 7pm Central and "This weekend" was Sat-Sun
 * and jumped to next week on a Sunday. Every bound now comes from
 * centralWindow(), the same helper the landings use, so ?preset=this-weekend
 * and /events/this-weekend return the same set.
 */

export const EVENTS_PER_PAGE = 30;

/** A hub row: the list projection, plus the distance near-me adds. */
export type HubEvent = Event & { distance_meters?: number | null };

export type HubSort = "date_asc" | "date_desc" | "newest" | "title_asc";

export interface HubFilters {
  /** Full-text search term, already debounced. Empty for none. */
  search: string;
  /** A category value, or "all". */
  category: string;
  /** Central-time window, or null for "upcoming". */
  window: CentralWindow | null;
  area: EventArea | undefined;
  freeOnly: boolean;
  sort: HubSort;
}

// ---------------------------------------------------------------------------
// Date params
// ---------------------------------------------------------------------------

/** URL `preset` values the hub understands, with their chip labels. */
export const HUB_DATE_PRESETS: ReadonlyArray<{
  key: Extract<CentralWindowPreset, string>;
  label: string;
}> = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "this-weekend", label: "This weekend" },
  { key: "this-week", label: "This week" },
  { key: "next-week", label: "Next week" },
  { key: "next-7-days", label: "Next 7 days" },
];

/** Old spellings that shipped in links. `next_7_days` came from SmartFilters. */
const PRESET_ALIASES: Record<string, string> = { next_7_days: "next-7-days" };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDay(value: string | null | undefined): string | null {
  if (!value || !DAY_RE.test(value)) return null;
  return Number.isNaN(new Date(`${value}T12:00:00Z`).getTime()) ? null : value;
}

export interface ResolvedDate {
  window: CentralWindow;
  /** Chip and heading label: "Today", "Sep 27", "Sep 27 - Oct 2". */
  label: string;
  /** Which URL shape produced it. */
  source: "preset" | "custom";
  /** The canonical preset key when source is "preset". */
  preset?: string;
}

function dayLabel(day: string): string {
  return format(new Date(`${day}T12:00:00`), "MMM d");
}

/**
 * `?preset=` wins; otherwise `?from=` (and optional `?to=`) is a custom day or
 * range. Anything unparseable is no date filter at all, never an error.
 */
export function resolveHubDate(
  preset: string | null,
  from: string | null,
  to: string | null,
  now: Date = new Date()
): ResolvedDate | null {
  const key = preset ? PRESET_ALIASES[preset] ?? preset : null;
  const known = key ? HUB_DATE_PRESETS.find((p) => p.key === key) : undefined;
  if (known) {
    return {
      window: centralWindow(known.key, now),
      label: known.label,
      source: "preset",
      preset: known.key,
    };
  }
  const fromDay = validDay(from);
  if (!fromDay) return null;
  const toDay = validDay(to);
  if (!toDay || toDay === fromDay) {
    return {
      window: centralWindow({ kind: "single", date: fromDay }, now),
      label: dayLabel(fromDay),
      source: "custom",
    };
  }
  const w = centralWindow({ kind: "range", from: fromDay, to: toDay }, now);
  return {
    window: w,
    label: `${dayLabel(w.startDay)} - ${dayLabel(w.endDay)}`,
    source: "custom",
  };
}

/**
 * A picked calendar day as `yyyy-MM-dd`. The date picker hands back a local
 * midnight, so this formats in the viewer's zone: the day they tapped is the
 * Central day we filter on. `toISOString()` would shift it a day for anyone
 * east of UTC.
 */
export function pickedDay(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

// ---------------------------------------------------------------------------
// Query predicates
// ---------------------------------------------------------------------------

/** The builder methods the hub calls; each returns the builder itself. */
interface HubChain {
  textSearch(column: string, query: string, options: { type: "websearch"; config: string }): HubChain;
  eq(column: string, value: string): HubChain;
  gte(column: string, value: string): HubChain;
  lte(column: string, value: string): HubChain;
  or(filters: string): HubChain;
  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): HubChain;
}

/** "Upcoming": started today in Central, or a multi-day event still running. */
export function upcomingOrFilter(now: Date): string {
  return `date.gte.${upcomingFloorUtc(now)},end_date.gte.${now.toISOString()}`;
}

/**
 * Add every hub predicate to an events query. Shallow constraint plus a cast,
 * for the TS2589 reason documented on applyEventVisibility.
 */
export function applyHubFilters<
  Q extends { neq: unknown; is: unknown; ilike: unknown; gte: unknown; lte: unknown }
>(query: Q, filters: HubFilters, now: Date): Q {
  let q = applyEventVisibility(query);
  if (filters.area) q = applyEventArea(q, filters.area);
  let chain = q as unknown as HubChain;

  if (filters.search) {
    chain = chain.textSearch("search_vector", filters.search, {
      type: "websearch",
      config: "english",
    });
  }
  if (filters.category && filters.category !== "all") {
    chain = chain.eq("category", filters.category);
  }

  // Two OR groups would be two `or=` params; nesting them in one keeps the
  // AND explicit instead of relying on how PostgREST combines repeated keys.
  const orGroups: string[] = [];
  if (filters.window) {
    chain = chain.gte("date", filters.window.start).lte("date", filters.window.end);
  } else {
    orGroups.push(upcomingOrFilter(now));
  }
  if (filters.freeOnly) orGroups.push(FREE_PRICE_FILTER);

  if (orGroups.length === 1) chain = chain.or(orGroups[0]);
  else if (orGroups.length > 1) {
    chain = chain.or(`and(${orGroups.map((g) => `or(${g})`).join(",")})`);
  }
  return chain as unknown as Q;
}

/** Sort, then id, so equal dates page stably and no row repeats or vanishes. */
export function applyHubSort<Q extends { order: unknown }>(query: Q, sort: HubSort): Q {
  const chain = query as unknown as HubChain;
  const primary: Record<HubSort, [string, boolean]> = {
    date_asc: ["date", true],
    date_desc: ["date", false],
    newest: ["created_at", false],
    title_asc: ["title", true],
  };
  const [column, ascending] = primary[sort] ?? primary.date_asc;
  return chain.order(column, { ascending }).order("id", { ascending: true }) as unknown as Q;
}

export function parseHubSort(value: string): HubSort {
  return value === "date_desc" || value === "newest" || value === "title_asc" ? value : "date_asc";
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

export interface HubPageParam {
  offset: number;
  limit: number;
}

export interface HubPage {
  events: HubEvent[];
  /** Exact total, asked for on the first page only. */
  total: number | null;
  offset: number;
  limit: number;
  /** Near-me answers in one page; there is nothing after it. */
  complete: boolean;
}

export async function fetchHubPage(
  filters: HubFilters,
  param: HubPageParam,
  now: Date
): Promise<HubPage> {
  const withCount = param.offset === 0;
  let query = supabase
    .from("events")
    .select(EVENT_LIST_COLUMNS, withCount ? { count: "exact" } : undefined);
  query = applyHubFilters(query, filters, now);
  query = applyHubSort(query, filters.sort);
  const { data, error, count } = await query.range(
    param.offset,
    param.offset + param.limit - 1
  );
  if (error) throw error;
  const events = (data ?? []) as unknown as HubEvent[];
  return {
    events,
    total: withCount ? count ?? events.length : null,
    offset: param.offset,
    limit: param.limit,
    complete: events.length < param.limit,
  };
}

/** Rows matching these filters, as a count-only HEAD request. */
export async function countHub(filters: HubFilters, now: Date): Promise<number> {
  let query = supabase.from("events").select("id", { count: "exact", head: true });
  query = applyHubFilters(query, filters, now);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/** 30 miles, what the Near Me chip has always promised. */
const NEAR_ME_RADIUS_METERS = 48280;
const NEAR_ME_LIMIT = 100;

function startOf(event: { event_start_utc?: string | null; date?: string | Date | null }): number {
  const raw = event.event_start_utc || event.date;
  if (!raw) return NaN;
  return new Date(raw).getTime();
}

/**
 * Near me, interim (WP1 item 6). The RPC applies no visibility predicates and
 * takes no window (deferred D1), so both happen here: ids that fail
 * filterVisibleIds are dropped, then the same window, area, category, search
 * and price rules the list query applies. Distance order is kept.
 */
export async function fetchNearMe(
  filters: HubFilters,
  origin: { latitude: number; longitude: number },
  now: Date
): Promise<HubPage> {
  const { data, error } = await supabase.rpc("search_events_near_location", {
    user_lat: origin.latitude,
    user_lon: origin.longitude,
    radius_meters: NEAR_ME_RADIUS_METERS,
    search_limit: NEAR_ME_LIMIT,
  });
  if (error) throw error;
  const rows = (data ?? []) as unknown as HubEvent[];
  const visible = await filterVisibleIds(rows.map((r) => r.id));

  const floor = new Date(upcomingFloorUtc(now)).getTime();
  const nowMs = now.getTime();
  const lo = filters.window ? new Date(filters.window.start).getTime() : null;
  const hi = filters.window ? new Date(filters.window.end).getTime() : null;
  const term = filters.search.trim().toLowerCase();

  const events = rows.filter((e) => {
    if (!visible.has(e.id)) return false;
    const start = startOf(e);
    if (lo !== null && hi !== null) {
      if (!(start >= lo && start <= hi)) return false;
    } else {
      const end = e.end_date ? new Date(e.end_date).getTime() : NaN;
      if (!(start >= floor || end >= nowMs)) return false;
    }
    if (filters.category !== "all" && e.category !== filters.category) return false;
    if (filters.area && !eventInArea(e, filters.area)) return false;
    if (filters.freeOnly && isFreePrice(e.price) !== true) return false;
    if (term) {
      const hay = [e.title, e.venue, e.enhanced_description].join(" ").toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });

  return { events, total: events.length, offset: 0, limit: events.length, complete: true };
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

/** Flatten pages, dropping any id a later page repeats. */
export function flattenPages(pages: readonly HubPage[]): HubEvent[] {
  const seen = new Set<string>();
  const out: HubEvent[] = [];
  for (const page of pages) {
    for (const event of page.events) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      out.push(event);
    }
  }
  return out;
}

/** "30 of 412 events", or "12 events" when everything is loaded. */
export function countLabel(loaded: number, total: number): string {
  const noun = total === 1 ? "event" : "events";
  if (loaded >= total) return `${total.toLocaleString()} ${noun}`;
  return `${loaded.toLocaleString()} of ${total.toLocaleString()} ${noun}`;
}

/** The Central day an event is listed under; running events list today. */
export function listingDay(event: HubEvent, now: Date): string | null {
  const start = startOf(event);
  if (!Number.isFinite(start)) return null;
  const today = centralDateOf(now);
  const day = centralDateOf(new Date(start));
  return day < today ? today : day;
}

export interface DayGroup {
  /** Central date, `yyyy-MM-dd`, or "undated". */
  day: string;
  label: string;
  events: HubEvent[];
}

/** Header text for a Central day, relative to `now`. */
export function dayHeading(day: string, now: Date): string {
  const today = centralDateOf(now);
  if (day === today) return centralHour(now) >= 17 ? "Tonight" : "Today";
  if (day === addCentralDays(today, 1)) return "Tomorrow";
  const d = new Date(`${day}T12:00:00`);
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return format(d, sameYear ? "EEEE, MMM d" : "EEEE, MMM d, yyyy");
}

/**
 * Consecutive runs of the same listing day, in input order. The input is
 * already sorted by date, so this never reorders; it only draws lines.
 */
export function groupByCentralDay(events: readonly HubEvent[], now: Date): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const event of events) {
    const day = listingDay(event, now) ?? "undated";
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.events.push(event);
    } else {
      groups.push({
        day,
        label: day === "undated" ? "Date to be announced" : dayHeading(day, now),
        events: [event],
      });
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Tonight strip (WP1 item 9, bet 2)
// ---------------------------------------------------------------------------

/** "Starting soon" reaches this far ahead. */
export const TONIGHT_AHEAD_MS = 3 * 60 * 60 * 1000;
const TONIGHT_CAP = 12;

export interface TonightItem {
  event: HubEvent;
  /** "soon": starts within 3 hours. "now": started earlier, end_date not passed. */
  status: "soon" | "now";
  startMs: number;
}

/**
 * Starting in the next three hours (soonest first), then events already
 * running by their end_date. A row that started earlier with no end_date is
 * not "happening now": nothing says it still is.
 */
export function selectTonight(rows: readonly HubEvent[], now: Date, cap = TONIGHT_CAP): TonightItem[] {
  const nowMs = now.getTime();
  const soon: TonightItem[] = [];
  const running: TonightItem[] = [];
  const seen = new Set<string>();
  for (const event of rows) {
    if (seen.has(event.id)) continue;
    const startMs = startOf(event);
    if (!Number.isFinite(startMs)) continue;
    if (startMs >= nowMs && startMs <= nowMs + TONIGHT_AHEAD_MS) {
      soon.push({ event, status: "soon", startMs });
      seen.add(event.id);
      continue;
    }
    const endMs = event.end_date ? new Date(event.end_date).getTime() : NaN;
    if (startMs < nowMs && Number.isFinite(endMs) && nowMs <= endMs) {
      running.push({ event, status: "now", startMs });
      seen.add(event.id);
    }
  }
  soon.sort((a, b) => a.startMs - b.startMs);
  return [...soon, ...running].slice(0, cap);
}

/** "Starts in 40 min", "Starts in 2 hr 15 min", "Happening now". */
export function relativeStartLabel(item: Pick<TonightItem, "status" | "startMs">, now: Date): string {
  if (item.status === "now") return "Happening now";
  const minutes = Math.max(0, Math.round((item.startMs - now.getTime()) / 60000));
  if (minutes < 1) return "Starting now";
  if (minutes < 60) return `Starts in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `Starts in ${hours} hr` : `Starts in ${hours} hr ${rest} min`;
}

/** Cache bucket, so the strip refetches every 15 minutes and not per render. */
const TONIGHT_BUCKET_MS = 15 * 60 * 1000;

/**
 * Rows that could be in the strip: started today (Central) up to three hours
 * and one bucket from now, or still running by end_date. selectTonight then
 * picks from them against the live clock.
 */
export function useTonightStripEvents(enabled: boolean, now: Date) {
  const bucket = Math.floor(now.getTime() / TONIGHT_BUCKET_MS);
  return useQuery({
    queryKey: queryKeys.events.list({ hub: "tonight", bucket }),
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<HubEvent[]> => {
      const at = new Date(bucket * TONIGHT_BUCKET_MS);
      const nowIso = at.toISOString();
      const horizon = new Date(at.getTime() + TONIGHT_AHEAD_MS + TONIGHT_BUCKET_MS).toISOString();
      const floor = upcomingFloorUtc(at);
      const { data, error } = await applyEventVisibility(
        supabase.from("events").select(EVENT_LIST_COLUMNS)
      )
        .or(
          `and(date.gte.${floor},date.lte.${horizon}),and(date.lt.${nowIso},end_date.gte.${nowIso})`
        )
        .order("date", { ascending: true })
        .limit(40);
      if (error) throw error;
      return (data ?? []) as unknown as HubEvent[];
    },
  });
}
