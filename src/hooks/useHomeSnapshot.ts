import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/errorHandler";
import {
  CENTRAL_TIMEZONE,
  createEventSlugWithCentralTime,
  formatEventPart,
  formatEventTimeOnly,
} from "@/lib/timezone";

/**
 * The dated, quotable paragraph on the home page (WP5 item 4,
 * docs/page-plans/home.md): "As of Thursday, September 24 (Central): 38
 * events this weekend, 12 listed as free. Next up: ...".
 *
 * Every number here comes from a count query or the paragraph does not
 * render. There is no fallback figure, and a failed query is not a zero.
 *
 * The visibility predicate is the one fetchHomepageCounts uses
 * (useHomepageStats.ts): not merged, not hidden, not archived. A count that
 * includes rows the linked page will not show is a count that disagrees with
 * its own link.
 */

export interface HomeSnapshotWindow {
  /** Today in Central, yyyy-MM-dd. Goes in <time dateTime>. */
  asOfDate: string;
  /** "Thursday, September 24" */
  asOfLabel: string;
  /** UTC bounds of the rest of this weekend, Friday to Sunday Central. */
  weekendStartUtc: string;
  weekendEndUtc: string;
  /** "Friday, September 25 - Sunday, September 27" */
  weekendLabel: string;
}

export interface HomeSnapshotNextUp {
  title: string;
  href: string;
  venue: string | null;
  /** "today", "tomorrow" or a weekday name, in Central. */
  dayLabel: string | null;
  /** "7:00 PM", or null when the source gave no start time. */
  timeLabel: string | null;
}

export interface HomeSnapshot extends HomeSnapshotWindow {
  weekendCount: number;
  weekendFreeCount: number;
  nextUp: HomeSnapshotNextUp | null;
}

const DAY = "yyyy-MM-dd";

/** Central calendar date `offset` days from `centralDate` (yyyy-MM-dd). */
function shiftCentralDate(centralDate: string, offset: number): string {
  // Noon UTC keeps the arithmetic clear of any DST edge.
  return formatInTimeZone(addDays(parseISO(`${centralDate}T12:00:00Z`), offset), "UTC", DAY);
}

function centralDayStartUtc(centralDate: string): string {
  return fromZonedTime(`${centralDate}T00:00:00`, CENTRAL_TIMEZONE).toISOString();
}

function centralDayEndUtc(centralDate: string): string {
  return fromZonedTime(`${centralDate}T23:59:59.999`, CENTRAL_TIMEZONE).toISOString();
}

function labelFor(centralDate: string): string {
  return formatInTimeZone(parseISO(`${centralDate}T12:00:00Z`), "UTC", "EEEE, MMMM d");
}

/**
 * The window the snapshot counts, from the Central calendar, not the reader's.
 *
 * Monday to Thursday it is the coming Friday 00:00 to Sunday 23:59. From
 * Friday on it starts at the beginning of today instead, so on a Saturday the
 * count is what is left of the weekend rather than including Friday night.
 * Exported for the unit tests.
 */
export function homeSnapshotWindow(now: Date = new Date()): HomeSnapshotWindow {
  const today = formatInTimeZone(now, CENTRAL_TIMEZONE, DAY);
  const dow = Number(formatInTimeZone(now, CENTRAL_TIMEZONE, "i")) % 7; // 0 Sun - 6 Sat

  const offsetToFriday = dow === 0 ? -2 : 5 - dow;
  const friday = shiftCentralDate(today, offsetToFriday);
  const sunday = shiftCentralDate(friday, 2);
  const start = offsetToFriday < 0 ? today : friday;

  return {
    asOfDate: today,
    asOfLabel: labelFor(today),
    weekendStartUtc: centralDayStartUtc(start),
    weekendEndUtc: centralDayEndUtc(sunday),
    weekendLabel: `${labelFor(start)} - ${labelFor(sunday)}`,
  };
}

interface NextUpRow {
  id: string;
  title: string | null;
  date: string | null;
  event_start_utc: string | null;
  event_start_local: string | null;
  venue: string | null;
}

/** Exported for the unit tests. */
export function toNextUp(row: NextUpRow | null | undefined, asOfDate: string): HomeSnapshotNextUp | null {
  if (!row?.title) return null;
  const eventDay = formatEventPart(row, DAY);
  let dayLabel: string | null = null;
  if (eventDay === asOfDate) dayLabel = "today";
  else if (eventDay && eventDay === shiftCentralDate(asOfDate, 1)) dayLabel = "tomorrow";
  else if (eventDay) dayLabel = formatEventPart(row, "EEEE");

  return {
    title: row.title,
    href: `/events/${createEventSlugWithCentralTime(row.title, row)}`,
    venue: row.venue?.trim() || null,
    dayLabel,
    timeLabel: formatEventTimeOnly(row),
  };
}

/** Exported for the unit tests. */
export async function fetchHomeSnapshot(now: Date = new Date()): Promise<HomeSnapshot> {
  const window = homeSnapshotWindow(now);

  const [weekendRes, freeRes, nextRes] = await Promise.all([
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .gte("date", window.weekendStartUtc)
      .lte("date", window.weekendEndUtc)
      .neq("is_merged", true)
      .neq("is_hidden", true)
      .is("archived_at", null),

    // Free means the source SAID free or 0. /events/free also counts a null
    // price, which is "unknown", not "free"; a sentence quoted as fact may
    // not round unknown up to free, so the wording below is "listed as free".
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .gte("date", window.weekendStartUtc)
      .lte("date", window.weekendEndUtc)
      .neq("is_merged", true)
      .neq("is_hidden", true)
      .is("archived_at", null)
      .or("price.ilike.%free%,price.eq.0"),

    supabase
      .from("events")
      .select("id, title, date, event_start_utc, event_start_local, venue")
      .gte("date", now.toISOString())
      .neq("is_merged", true)
      .neq("is_hidden", true)
      .is("archived_at", null)
      .order("date", { ascending: true })
      .limit(1),
  ]);

  const failure = weekendRes.error ?? freeRes.error ?? nextRes.error;
  if (failure) throw failure;
  if (weekendRes.count == null || freeRes.count == null) {
    // A HEAD count with no count and no error is not a zero either.
    throw new Error("home snapshot: count query returned no count");
  }

  const rows = (nextRes.data ?? []) as unknown as NextUpRow[];

  return {
    ...window,
    weekendCount: weekendRes.count,
    weekendFreeCount: freeRes.count,
    nextUp: toNextUp(rows[0], window.asOfDate),
  };
}

export interface HomeSnapshotState {
  /** Null while loading and on any failure. Render nothing when null. */
  snapshot: HomeSnapshot | null;
  isLoading: boolean;
  isError: boolean;
}

export function useHomeSnapshot(): HomeSnapshotState {
  // Keyed on the Central date so the paragraph rolls over at midnight in
  // Des Moines rather than at the reader's midnight.
  const asOfDate = formatInTimeZone(new Date(), CENTRAL_TIMEZONE, DAY);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["home-snapshot", asOfDate],
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
