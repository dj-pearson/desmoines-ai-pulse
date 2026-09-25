import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatInTimeZone } from "date-fns-tz";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/errorHandler";
import { applyEventVisibility } from "@/lib/eventQuery";
import { FREE_PRICE_FILTER } from "@/lib/eventPrice";
import { ongoingStartFilter } from "@/hooks/useEventLanding";
import {
  addCentralDays,
  centralDateOf,
  centralWeekday,
  centralWindow,
  createEventSlugWithCentralTime,
  formatEventPart,
  formatEventTimeOnly,
  type CentralDate,
} from "@/lib/timezone";

/**
 * The dated, quotable paragraph on the home page: "As of Saturday,
 * September 26 (Central): 38 events this weekend, 12 of them listed as free;
 * 20 still to come. Next up: ...".
 *
 * EVERY NUMBER IS THE NUMBER ON THE PAGE IT LINKS TO (home pass-2 WP4 items 2
 * and 3). The first pass built its own Friday-to-Sunday window and its own
 * free filter, so the sentence and /events/this-weekend disagreed: the page
 * uses centralWindow('this-weekend') with running events included
 * (useEventLanding, includeOngoing) and FREE_PRICE_FILTER. This builds the
 * same filters from the same helpers, and useHomeSnapshot.test.ts compares
 * the two query builders call for call.
 *
 * Every number comes from a count query or the paragraph does not render.
 * There is no fallback figure, and a failed query is not a zero.
 */

export interface HomeSnapshotWindow {
  /** Today in Central, yyyy-MM-dd. Goes in <time dateTime>. */
  asOfDate: string;
  /** "Thursday, September 24" */
  asOfLabel: string;
  /** UTC bounds of this weekend, Friday to Sunday Central (centralWindow). */
  weekendStartUtc: string;
  weekendEndUtc: string;
  /** "Friday, September 25 - Sunday, September 27" */
  weekendLabel: string;
  /**
   * Saturday and Sunday only: the start of today, Central, as UTC. What is
   * "still to come" is counted from here to weekendEndUtc. Null otherwise.
   */
  remainingStartUtc: string | null;
  /** "today" on a Sunday, "today and Sunday" on a Saturday. Null otherwise. */
  remainingLabel: string | null;
  /** Upper bound for "next up": the end of the 7th Central day from today. */
  nextUpEndUtc: string;
}

export interface HomeSnapshotEvent {
  title: string;
  href: string;
}

export interface HomeSnapshotNextUp extends HomeSnapshotEvent {
  venue: string | null;
  /** "today", "tomorrow" or "Saturday, October 3", in Central. */
  dayLabel: string | null;
  /** "7:00 PM", or null when the source gave no start time. */
  timeLabel: string | null;
}

export interface HomeSnapshot extends HomeSnapshotWindow {
  weekendCount: number;
  weekendFreeCount: number;
  /** Saturday and Sunday only; null the rest of the week. */
  remainingCount: number | null;
  nextUp: HomeSnapshotNextUp | null;
  /** The first few weekend events, for the ItemList. Never counted from. */
  weekendEvents: HomeSnapshotEvent[];
}

/** How many weekend events the ItemList names. */
export const SNAPSHOT_ITEM_LIMIT = 5;

/** "Friday, September 25", from a Central calendar date. */
function labelFor(day: CentralDate): string {
  // Noon UTC is the same calendar day in Central, whatever the reader's zone.
  return formatInTimeZone(new Date(`${day}T12:00:00Z`), "UTC", "EEEE, MMMM d");
}

/** One day prints once; a range prints both ends. Exported for the tests. */
export function rangeLabel(from: CentralDate, to: CentralDate): string {
  return from === to ? labelFor(from) : `${labelFor(from)} - ${labelFor(to)}`;
}

/**
 * The windows the snapshot counts, from the Central calendar, not the
 * reader's. The weekend is centralWindow('this-weekend'), the landing's own
 * window: Friday to Sunday, and on a weekend day the weekend in progress.
 * Exported for the unit tests.
 */
export function homeSnapshotWindow(now: Date = new Date()): HomeSnapshotWindow {
  const today = centralDateOf(now);
  const weekend = centralWindow("this-weekend", now);
  const weekday = centralWeekday(today); // 0 Sun - 6 Sat
  const midWeekend = weekday === 6 || weekday === 0;

  let remainingLabel: string | null = null;
  if (weekday === 0) remainingLabel = "today";
  else if (weekday === 6) remainingLabel = "today and Sunday";

  return {
    asOfDate: today,
    asOfLabel: labelFor(today),
    weekendStartUtc: weekend.start,
    weekendEndUtc: weekend.end,
    weekendLabel: rangeLabel(weekend.startDay, weekend.endDay),
    remainingStartUtc: midWeekend ? centralWindow({ kind: "single", date: today }).start : null,
    remainingLabel,
    nextUpEndUtc: centralWindow("next-7-days", now).end,
  };
}

/**
 * The events filter /events/this-weekend sends (useEventLanding with
 * `window: 'this-weekend', includeOngoing: true`), applied to an events query
 * the caller has already passed through applyEventVisibility (kept at the call
 * site so check-event-unpublish-filters can see it): starts in the window or started earlier and is still
 * running at its start, and not after its end. `or` narrows it the way the
 * landing's own `or` option does, inside one or() because a second .or() is a
 * second query param PostgREST does not promise to AND.
 *
 * Exported for the unit test that holds it equal to the landing's.
 */
export function applyWeekendFilter<Q>(
  query: Q,
  from: string,
  to: string,
  or?: string,
): Q {
  const ongoing = ongoingStartFilter(from);
  const chain = query as unknown as {
    or(filter: string): { lte(column: string, value: string): Q };
  };
  return chain.or(or ? `and(or(${ongoing}),or(${or}))` : ongoing).lte("date", to);
}

interface SnapshotRow {
  id: string;
  title: string | null;
  date: string | null;
  event_start_utc: string | null;
  event_start_local: string | null;
  venue: string | null;
}

const ROW_COLUMNS = "id, title, date, event_start_utc, event_start_local, venue";

function toEvent(row: SnapshotRow | null | undefined): HomeSnapshotEvent | null {
  if (!row?.title) return null;
  return { title: row.title, href: `/events/${createEventSlugWithCentralTime(row.title, row)}` };
}

/** Exported for the unit tests. */
export function toNextUp(row: SnapshotRow | null | undefined, asOfDate: string): HomeSnapshotNextUp | null {
  const event = toEvent(row);
  if (!event || !row) return null;
  const eventDay = formatEventPart(row, "yyyy-MM-dd");
  let dayLabel: string | null = null;
  if (eventDay === asOfDate) dayLabel = "today";
  else if (eventDay && eventDay === addCentralDays(asOfDate, 1)) dayLabel = "tomorrow";
  // Beyond tomorrow a bare weekday is ambiguous across a 7-day window.
  else if (eventDay) dayLabel = formatEventPart(row, "EEEE, MMMM d");

  return {
    ...event,
    venue: row.venue?.trim() || null,
    dayLabel,
    timeLabel: formatEventTimeOnly(row),
  };
}

/** Exported for the unit tests. */
export async function fetchHomeSnapshot(now: Date = new Date()): Promise<HomeSnapshot> {
  const window = homeSnapshotWindow(now);
  const { weekendStartUtc: from, weekendEndUtc: to } = window;

  const [weekendRes, freeRes, remainingRes, nextRes] = await Promise.all([
    // The count and the ItemList's first rows in one request: count=exact
    // reports the total in Content-Range whatever the limit.
    applyWeekendFilter(
      applyEventVisibility(supabase.from("events").select(ROW_COLUMNS, { count: "exact" })),
      from,
      to,
    )
      .order("date", { ascending: true })
      .limit(SNAPSHOT_ITEM_LIMIT),

    applyWeekendFilter(
      applyEventVisibility(supabase.from("events").select("id", { count: "exact", head: true })),
      from,
      to,
      FREE_PRICE_FILTER,
    ),

    window.remainingStartUtc
      ? applyWeekendFilter(
          applyEventVisibility(supabase.from("events").select("id", { count: "exact", head: true })),
          window.remainingStartUtc,
          to,
        )
      : Promise.resolve(null),

    // Next up: the soonest start from now, within the next 7 Central days.
    applyEventVisibility(supabase.from("events").select(ROW_COLUMNS))
      .gte("date", now.toISOString())
      .lte("date", window.nextUpEndUtc)
      .order("date", { ascending: true })
      .limit(1),
  ]);

  const failure = weekendRes.error ?? freeRes.error ?? remainingRes?.error ?? nextRes.error;
  if (failure) throw failure;
  if (weekendRes.count == null || freeRes.count == null || (remainingRes && remainingRes.count == null)) {
    // A count query with no count and no error is not a zero either.
    throw new Error("home snapshot: count query returned no count");
  }

  const weekendRows = (weekendRes.data ?? []) as unknown as SnapshotRow[];
  const nextRows = (nextRes.data ?? []) as unknown as SnapshotRow[];

  return {
    ...window,
    weekendCount: weekendRes.count,
    weekendFreeCount: freeRes.count,
    remainingCount: remainingRes ? remainingRes.count : null,
    nextUp: toNextUp(nextRows[0], window.asOfDate),
    weekendEvents: weekendRows
      .map((row) => toEvent(row))
      .filter((event): event is HomeSnapshotEvent => event !== null),
  };
}

/** Keyed on the Central date, so the paragraph rolls over at midnight in Des Moines. */
export function homeSnapshotQueryKey(asOfDate: string): readonly [string, string] {
  return ["home-snapshot", asOfDate];
}

export interface HomeSnapshotState {
  /** Null while loading and on any failure. Render nothing when null. */
  snapshot: HomeSnapshot | null;
  isLoading: boolean;
  isError: boolean;
}

export function useHomeSnapshot(): HomeSnapshotState {
  const asOfDate = centralDateOf(new Date());

  const { data, isLoading, isError, error } = useQuery({
    queryKey: homeSnapshotQueryKey(asOfDate),
    queryFn: () => fetchHomeSnapshot(),
    staleTime: 5 * 60 * 1000,
  });

  // In an effect so a persisting error is reported once, not per render.
  useEffect(() => {
    if (error) {
      handleError(error, { component: "useHomeSnapshot", action: "fetchHomeSnapshot" });
    }
  }, [error]);

  return { snapshot: data ?? null, isLoading, isError };
}

/**
 * The snapshot's asOfDate for the WebPage node's dateModified (WP4 item 5).
 * Reads the cache entry GEOContent fills and never fetches.
 *
 * `settled` is false until that query has succeeded or failed. The page head
 * waits for it, and that is not cosmetic: react-helmet-async registers an
 * instance during render, so a render React throws away (a restarted
 * concurrent render) leaves an instance behind that never unmounts. While its
 * props match the live one Helmet dedupes them; once dateModified arrives they
 * differ and the page ships two WebPage nodes. Rendering the schema only with
 * its final props keeps any such orphan identical to the live instance.
 */
export function useHomeSnapshotAsOfDate(): { asOfDate: string | null; settled: boolean } {
  const asOfDate = centralDateOf(new Date());
  const { data, status } = useQuery({
    queryKey: homeSnapshotQueryKey(asOfDate),
    queryFn: () => fetchHomeSnapshot(),
    enabled: false,
    staleTime: 5 * 60 * 1000,
  });
  return { asOfDate: data?.asOfDate ?? null, settled: status !== "pending" };
}
