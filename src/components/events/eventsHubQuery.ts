import { format } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EVENT_LIST_COLUMNS } from "@/lib/listColumns";
import { queryKeys } from "@/lib/queryKeys";
import { applyEventVisibility } from "@/lib/eventQuery";
import { applyEventArea, eventAreaOrFilter, eventInArea, type EventArea } from "@/lib/eventAreas";
import { FREE_PRICE_FILTER, isFreePrice } from "@/lib/eventPrice";
import { roundCoordinate } from "@/lib/nearMeOrigins";
import { isSponsoredActive, SPONSORED_CAP } from "@/lib/sponsored";
import { EVENING_START_HOUR, eventStartInstant, type TonightEvent } from "@/lib/tonightPairings";
import { ongoingStartFilter } from "@/hooks/useEventLanding";
import {
  addCentralDays,
  CENTRAL_TIMEZONE,
  centralDateOf,
  centralHour,
  centralWindow,
  hasSpecificTime,
  NO_TIME_MARKER,
  upcomingFloorUtc,
  type CentralWindow,
  type CentralWindowPreset,
} from "@/lib/timezone";
import type { Event } from "@/lib/types";

/**
 * The /events hub's query, in one place (docs/page-plans/events.md WP1,
 * events-pass2.md WP1).
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
 * range. Anything unparseable is no date filter at all, never an error. An
 * inverted range (`from` after `to`) is read the right way round.
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
  let fromDay = validDay(from);
  let toDay = validDay(to);
  if (!fromDay) return null;
  if (!toDay || toDay === fromDay) {
    return {
      window: centralWindow({ kind: "single", date: fromDay }, now),
      label: dayLabel(fromDay),
      source: "custom",
    };
  }
  if (toDay < fromDay) [fromDay, toDay] = [toDay, fromDay];
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
  textSearch(column: string, query: string, options: { type?: "websearch"; config: string }): HubChain;
  eq(column: string, value: string | boolean): HubChain;
  gte(column: string, value: string): HubChain;
  lte(column: string, value: string): HubChain;
  or(filters: string): HubChain;
  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): HubChain;
}

/**
 * The old "upcoming" floor: started today in Central, or a multi-day event
 * still running. The hub no longer uses it (an 8 AM class stayed at the top
 * of the list at 8 PM); DiscoverMap still does.
 */
export function upcomingOrFilter(now: Date): string {
  return `date.gte.${upcomingFloorUtc(now)},end_date.gte.${now.toISOString()}`;
}

/** A timed event that started this long ago may still be on. */
export const RECENT_START_GRACE_MS = 2 * 60 * 60 * 1000;

/**
 * The instant ingest writes for "no start time" on today's Central date
 * (19:31:58 Central). Matched exactly, so an untimed row stays listed all day
 * instead of dropping off two hours after a time nobody published.
 */
export function untimedMarkerToday(now: Date): string {
  return fromZonedTime(`${centralDateOf(now)}T${NO_TIME_MARKER}`, CENTRAL_TIMEZONE).toISOString();
}

/**
 * "Not over yet" (events-pass2 WP1 item 1), three arms: started in the last
 * two hours or later; a run whose end_date is still ahead; or today's untimed
 * marker. The list, the count and the map all go through this.
 */
export function notOverFilter(now: Date): string {
  const since = new Date(now.getTime() - RECENT_START_GRACE_MS).toISOString();
  return `date.gte.${since},end_date.gte.${now.toISOString()},date.eq.${untimedMarkerToday(now)}`;
}

/** Does the window hold this instant? */
export function windowContainsNow(window: CentralWindow, now: Date): boolean {
  const t = now.getTime();
  return Date.parse(window.start) <= t && t <= Date.parse(window.end);
}

/** tsquery operators and quoting; stripped from typed input before it is sent. */
const TSQUERY_META = /[&|!():*<>'"\\]/g;

export interface HubSearchQuery {
  query: string;
  /** undefined means to_tsquery (PostgREST `fts`). */
  type?: "websearch";
}

/**
 * The search box as a tsquery that matches while you type (item 12): every
 * word must match, and the last one is a prefix, so "jaz" finds jazz. Input
 * with quotes or an OR goes to websearch_to_tsquery, which understands them.
 */
export function hubSearchQuery(input: string): HubSearchQuery | null {
  const raw = input.trim();
  if (!raw) return null;
  if (raw.includes('"') || /(^|\s)OR(\s|$)/.test(raw)) return { query: raw, type: "websearch" };
  const tokens = raw.replace(TSQUERY_META, " ").split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { query: raw, type: "websearch" };
  const last = tokens.length - 1;
  return { query: tokens.map((t, i) => (i === last ? `${t}:*` : t)).join(" & ") };
}

export interface HubFilterOptions {
  /** Extra OR groups, AND-ed with the hub's own in the one `or=` param. */
  extraOr?: string[];
}

/**
 * Add every hub predicate to an events query. Shallow constraint plus a cast,
 * for the TS2589 reason documented on applyEventVisibility.
 */
export function applyHubFilters<
  Q extends { neq: unknown; is: unknown; ilike: unknown; gte: unknown; lte: unknown }
>(query: Q, filters: HubFilters, now: Date, options: HubFilterOptions = {}): Q {
  let q = applyEventVisibility(query);
  // A suburb's area is an OR group; it joins the one `or=` param below
  // instead of sending a second one. Other areas are plain predicates.
  const areaGroup = filters.area ? eventAreaOrFilter(filters.area) : null;
  if (filters.area && !areaGroup) q = applyEventArea(q, filters.area);
  let chain = q as unknown as HubChain;

  const search = hubSearchQuery(filters.search);
  if (search) {
    chain = chain.textSearch("search_vector", search.query, {
      ...(search.type ? { type: search.type } : {}),
      config: "english",
    });
  }
  if (filters.category && filters.category !== "all") {
    chain = chain.eq("category", filters.category);
  }

  // Several OR groups would be several `or=` params; nesting them in one keeps
  // the AND explicit instead of relying on how PostgREST combines repeated keys.
  const orGroups: string[] = [];
  if (filters.window) {
    // Same rule as the landings (useEventLanding includeOngoing): a festival
    // that started before the window and is still running is in it.
    orGroups.push(ongoingStartFilter(filters.window.start));
    chain = chain.lte("date", filters.window.end);
    if (windowContainsNow(filters.window, now)) orGroups.push(notOverFilter(now));
  } else {
    orGroups.push(notOverFilter(now));
  }
  if (filters.freeOnly) orGroups.push(FREE_PRICE_FILTER);
  if (areaGroup) orGroups.push(areaGroup);
  if (options.extraOr) orGroups.push(...options.extraOr);

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
  /** Nothing after this page. Near me answers in one page. */
  complete: boolean;
  /** Near me only: the RPC hit its row cap, so nearer matches may be missing. */
  capped?: boolean;
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

/** The PostgREST arm for "sponsorship not expired". */
export function sponsoredActiveFilter(now: Date): string {
  return `sponsored_until.is.null,sponsored_until.gt.${now.toISOString()}`;
}

/**
 * Active sponsored rows that match the hub's filters, wherever they fall in
 * organic order (item 9). The placement is sold as "moved to the top of the
 * list"; before this only a sponsored row already on page 1 moved. Position
 * only: what the sponsor pays is decided server-side.
 */
export async function fetchSponsoredLead(filters: HubFilters, now: Date): Promise<HubEvent[]> {
  let query = supabase.from("events").select(EVENT_LIST_COLUMNS);
  query = applyHubFilters(query, filters, now, { extraOr: [sponsoredActiveFilter(now)] });
  const { data, error } = await query
    .eq("is_sponsored", true)
    .order("sponsored_until", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(SPONSORED_CAP);
  if (error) throw error;
  return ((data ?? []) as unknown as HubEvent[]).filter((e) => isSponsoredActive(e));
}

/** 30 miles, what the Near Me chip has always promised. */
export const NEAR_ME_RADIUS_MILES = 30;
const NEAR_ME_RADIUS_METERS = 48280;
export const NEAR_ME_LIMIT = 100;

function startOf(event: { event_start_utc?: string | null; date?: string | Date | null }): number {
  const raw = event.event_start_utc || event.date;
  if (!raw) return NaN;
  return new Date(raw).getTime();
}

function endOf(event: { end_date?: string | null }): number {
  return event.end_date ? new Date(event.end_date).getTime() : NaN;
}

/** notOverFilter, for rows already in hand. */
export function isNotOver(event: HubEvent, now: Date): boolean {
  const start = startOf(event);
  const nowMs = now.getTime();
  if (start >= nowMs - RECENT_START_GRACE_MS) return true;
  if (endOf(event) >= nowMs) return true;
  return start === Date.parse(untimedMarkerToday(now));
}

/** applyHubFilters' window rule (with running festivals), for rows in hand. */
export function inHubWindow(event: HubEvent, window: CentralWindow, now: Date): boolean {
  const start = startOf(event);
  const lo = Date.parse(window.start);
  const hi = Date.parse(window.end);
  if (!(start <= hi)) return false;
  const inside = start >= lo || endOf(event) >= lo;
  if (!inside) return false;
  return windowContainsNow(window, now) ? isNotOver(event, now) : true;
}

interface NearMeRpcRow {
  id: string;
  distance_meters: number | null;
}

/**
 * Near me, interim until D1's v2 RPC. The RPC applies no visibility predicates,
 * takes no window and orders featured first, so it is used for ids and
 * distances only: one read of the list projection under the visibility rules
 * brings real sponsorship, end_date and time fields, then the hub's window,
 * area, category, search and price rules run here and the rows are sorted by
 * distance. The origin is rounded to 2 decimals first, as the near-me page
 * promises.
 */
export async function fetchNearMe(
  filters: HubFilters,
  origin: { latitude: number; longitude: number },
  now: Date
): Promise<HubPage> {
  const { data, error } = await supabase.rpc("search_events_near_location", {
    user_lat: roundCoordinate(origin.latitude),
    user_lon: roundCoordinate(origin.longitude),
    radius_meters: NEAR_ME_RADIUS_METERS,
    search_limit: NEAR_ME_LIMIT,
  });
  if (error) throw error;
  const rpcRows = (data ?? []) as unknown as NearMeRpcRow[];
  const capped = rpcRows.length >= NEAR_ME_LIMIT;
  const distance = new Map<string, number | null>();
  for (const row of rpcRows) if (row?.id) distance.set(row.id, row.distance_meters ?? null);

  let rows: HubEvent[] = [];
  if (distance.size > 0) {
    const { data: full, error: readError } = await applyEventVisibility(
      supabase.from("events").select(EVENT_LIST_COLUMNS)
    ).in("id", [...distance.keys()]);
    if (readError) throw readError;
    rows = (full ?? []) as unknown as HubEvent[];
  }

  const term = filters.search.trim().toLowerCase();
  const events = rows
    .filter((e) => {
      if (filters.window) {
        if (!inHubWindow(e, filters.window, now)) return false;
      } else if (!isNotOver(e, now)) {
        return false;
      }
      if (filters.category !== "all" && e.category !== filters.category) return false;
      if (filters.area && !eventInArea(e, filters.area)) return false;
      if (filters.freeOnly && isFreePrice(e.price) !== true) return false;
      if (term) {
        const hay = [e.title, e.venue, e.enhanced_description].join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    })
    .map((e) => ({ ...e, distance_meters: distance.get(e.id) ?? null }))
    .sort((a, b) => (a.distance_meters ?? Infinity) - (b.distance_meters ?? Infinity));

  return {
    events,
    total: events.length,
    offset: 0,
    limit: events.length,
    complete: !capped,
    capped,
  };
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

/** Flatten pages, dropping any id a later page repeats, and any in `exclude`. */
export function flattenPages(
  pages: readonly HubPage[],
  exclude: ReadonlySet<string> = new Set()
): HubEvent[] {
  const seen = new Set<string>(exclude);
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

/** "Nearest 42 within 30 mi", for near-me mode on the hub. */
export function nearMeCountLabel(count: number, capped: boolean): string {
  const base =
    count === 1
      ? `1 event within ${NEAR_ME_RADIUS_MILES} mi`
      : `Nearest ${count.toLocaleString()} within ${NEAR_ME_RADIUS_MILES} mi`;
  return capped ? `${base}; more exist, narrow the filters` : base;
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

/** "Friday, Sep 25", with the year when it isn't this year's. */
function absoluteDayHeading(day: string, today: string): string {
  const d = new Date(`${day}T12:00:00`);
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return format(d, sameYear ? "EEEE, MMM d" : "EEEE, MMM d, yyyy");
}

/**
 * Header text for a Central day. Relative ("Tonight", "Tomorrow") by default;
 * with `relative: false` always the date, which is what the prerendered HTML
 * carries, since it is frozen hours before anyone reads it (item 6).
 */
export function dayHeading(day: string, now: Date, relative = true): string {
  const today = centralDateOf(now);
  if (relative) {
    if (day === today) return centralHour(now) >= 17 ? "Tonight" : "Today";
    if (day === addCentralDays(today, 1)) return "Tomorrow";
  }
  return absoluteDayHeading(day, today);
}

/**
 * Consecutive runs of the same listing day, in input order. The input is
 * already sorted by date, so this never reorders; it only draws lines.
 */
export function groupByCentralDay(
  events: readonly HubEvent[],
  now: Date,
  relative = true
): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const event of events) {
    const day = listingDay(event, now) ?? "undated";
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.events.push(event);
    } else {
      groups.push({
        day,
        label: day === "undated" ? "Date to be announced" : dayHeading(day, now, relative),
        events: [event],
      });
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Tonight strip (events.md WP1 item 9; events-pass2 WP1 items 2-4)
// ---------------------------------------------------------------------------

/** "Starting soon" reaches this far ahead. */
export const TONIGHT_AHEAD_MS = 3 * 60 * 60 * 1000;
const TONIGHT_CAP = 12;
/** Each of the strip's two requests asks for at most this many rows. */
export const STRIP_REQUEST_LIMIT = 12;

export type TonightStatus = "soon" | "now" | "untimed";

export interface TonightItem {
  event: HubEvent;
  /**
   * "soon": a published start within 3 hours. "now": started earlier and its
   * end_date has not passed. "untimed": listed for today with no start time.
   */
  status: TonightStatus;
  /** The published start, or null when the source gave none. */
  startMs: number | null;
}

/**
 * The start instant the strip may count down to: null for time_tbd, the
 * 19:31:58 no-time marker, and whatever else hasSpecificTime refuses.
 */
export function stripStartInstant(event: HubEvent): Date | null {
  if (!hasSpecificTime(event)) return null;
  return eventStartInstant(event as unknown as TonightEvent);
}

/**
 * Timed rows starting in the next three hours (soonest first), then events
 * running by their end_date, then today's rows with no published time. A row
 * that started earlier with no end_date is not "happening now": nothing says
 * it still is.
 */
export function selectTonight(rows: readonly HubEvent[], now: Date, cap = TONIGHT_CAP): TonightItem[] {
  const nowMs = now.getTime();
  const today = centralDateOf(now);
  const soon: TonightItem[] = [];
  const running: TonightItem[] = [];
  const untimed: TonightItem[] = [];
  const seen = new Set<string>();
  for (const event of rows) {
    if (!event?.id || seen.has(event.id)) continue;
    const raw = startOf(event);
    if (!Number.isFinite(raw)) continue;
    const endMs = endOf(event);
    const runningNow = raw < nowMs && Number.isFinite(endMs) && nowMs <= endMs;
    const start = stripStartInstant(event);
    if (start) {
      const startMs = start.getTime();
      if (startMs >= nowMs && startMs <= nowMs + TONIGHT_AHEAD_MS) {
        soon.push({ event, status: "soon", startMs });
      } else if (runningNow) {
        running.push({ event, status: "now", startMs });
      } else {
        continue;
      }
    } else if (centralDateOf(new Date(raw)) === today) {
      untimed.push({ event, status: "untimed", startMs: null });
    } else if (runningNow) {
      running.push({ event, status: "now", startMs: null });
    } else {
      continue;
    }
    seen.add(event.id);
  }
  soon.sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
  return [...soon, ...running, ...untimed].slice(0, cap);
}

/** "Starts in 40 min", "Happening now", "Today, time not listed". */
export function relativeStartLabel(item: Pick<TonightItem, "status" | "startMs">, now: Date): string {
  if (item.status === "now") return "Happening now";
  if (item.status === "untimed" || item.startMs === null) return "Today, time not listed";
  const minutes = Math.max(0, Math.round((item.startMs - now.getTime()) / 60000));
  if (minutes < 1) return "Starting now";
  if (minutes < 60) return `Starts in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `Starts in ${hours} hr` : `Starts in ${hours} hr ${rest} min`;
}

/**
 * The strip's title (item 4): "Starting soon" before 16:00 Central, then
 * "Tonight, Fri Sep 25". It used to say "Tonight" at 9 AM.
 */
export function stripHeading(now: Date): string {
  if (centralHour(now) < EVENING_START_HOUR) return "Starting soon";
  return `Tonight, ${formatInTimeZone(now, CENTRAL_TIMEZONE, "EEE MMM d")}`;
}

/** Cache bucket, so the strip refetches every 15 minutes and not per render. */
const TONIGHT_BUCKET_MS = 15 * 60 * 1000;

/**
 * The strip's rows, in two bounded requests (item 3), merged:
 *   soon    - date in [bucket, bucket + 3h15m], soonest first, 12 rows;
 *   running - started before the bucket, end_date still ahead, soonest end
 *             first, 12 rows.
 * The old single request read 40 rows from Central midnight, so on a busy day
 * the morning's rows used up the limit and the evening never arrived.
 * selectTonight then picks from them against the live clock.
 */
export function useTonightStripEvents(enabled: boolean, now: Date) {
  const bucket = Math.floor(now.getTime() / TONIGHT_BUCKET_MS);
  return useQuery({
    queryKey: queryKeys.events.list({ hub: "tonight", bucket }),
    enabled,
    staleTime: 5 * 60 * 1000,
    // A new bucket every 15 minutes must not blank the strip and shove the
    // list up while it refetches.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<HubEvent[]> => {
      const at = new Date(bucket * TONIGHT_BUCKET_MS);
      const atIso = at.toISOString();
      const horizon = new Date(at.getTime() + TONIGHT_AHEAD_MS + TONIGHT_BUCKET_MS).toISOString();
      const [soon, running] = await Promise.all([
        applyEventVisibility(supabase.from("events").select(EVENT_LIST_COLUMNS))
          .gte("date", atIso)
          .lte("date", horizon)
          .order("date", { ascending: true })
          .limit(STRIP_REQUEST_LIMIT),
        applyEventVisibility(supabase.from("events").select(EVENT_LIST_COLUMNS))
          .lt("date", atIso)
          .gte("end_date", atIso)
          .order("end_date", { ascending: true })
          .limit(STRIP_REQUEST_LIMIT),
      ]);
      if (soon.error) throw soon.error;
      if (running.error) throw running.error;
      return [
        ...((soon.data ?? []) as unknown as HubEvent[]),
        ...((running.data ?? []) as unknown as HubEvent[]),
      ];
    },
  });
}
