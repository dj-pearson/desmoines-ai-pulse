/**
 * Events for the Home dashboard's events group (home pass-2 WP3 item 5).
 *
 * Tomorrow's Central start through the end of the coming Sunday, weekend
 * first. One request in the ordinary case: the weekend window. Only when the
 * weekend has nothing listed does it ask for the weekdays before it, so the
 * group always has one honest heading ("This weekend" or "Later this week")
 * instead of a mix a reorder could not fill.
 *
 * Each band is two reads (WEB-FEAT-074): rows that START in the window, and
 * rows that started earlier and are still running when it opens, so a
 * festival that opened Thursday is under "This weekend". The running read is
 * capped at HOME_WEEK_RUNNING_LIMIT and ordered by end, the same shape as
 * useEventsInRange's ongoing request: a Thu-Sun festival sorts ahead of a
 * three-month exhibit, and neither can push a weekend start off the page,
 * because runs always come after the starts.
 *
 * No exact count (the block renders no totals), the list projection, and the
 * standard visibility predicate (applyEventVisibility).
 *
 * The key carries the Central date, so it rolls over at midnight rather than
 * on every render.
 */
import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { applyEventVisibility } from "@/lib/eventQuery";
import { EVENT_LIST_COLUMNS } from "@/lib/listColumns";
import { shouldRetry } from "@/lib/queryConfig";
import { homeWeekWindows, type HomeWeekBand } from "@/lib/dashboardItems";
import { centralDateOf, type CentralWindow } from "@/lib/timezone";

export interface HomeWeekEvent {
  id: string;
  title: string;
  date: string | null;
  end_date?: string | null;
  event_start_utc?: string | null;
  event_start_local?: string | null;
  event_timezone?: string | null;
  venue?: string | null;
  location?: string | null;
  city?: string | null;
  category?: string | null;
  price?: string | null;
  image_url?: string | null;
  source_url?: string | null;
  enhanced_description?: string | null;
  original_description?: string | null;
  is_enhanced?: boolean | null;
  is_featured?: boolean | null;
  is_sponsored?: boolean | null;
  sponsored_until?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/**
 * Runs carried into a band from before it opens. Small on purpose: the
 * group is a handful of cards, and season-long exhibits would otherwise
 * fill it.
 */
export const HOME_WEEK_RUNNING_LIMIT = 3;

export interface HomeWeekEventsResult {
  /** The band's starts in start order, then the runs carried into it. */
  events: HomeWeekEvent[];
  /**
   * How many of `events` came from the limit-sized starts read. Compare this,
   * not events.length, with the limit to decide whether the server may have
   * more: the runs are a fixed extra and never page.
   */
  startCount: number;
  /** Which window the rows came from; null before the first answer. */
  band: HomeWeekBand | null;
  /** Heading for the group, matching `band`. */
  label: string;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}

interface BandRows {
  starts: HomeWeekEvent[];
  running: HomeWeekEvent[];
}

async function readBand(window: CentralWindow, limit: number): Promise<BandRows> {
  const [starts, running] = await Promise.all([
    applyEventVisibility(
      supabase
        .from("events")
        .select(EVENT_LIST_COLUMNS)
        .gte("date", window.start)
        .lte("date", window.end),
    )
      .order("date", { ascending: true })
      .limit(limit),
    applyEventVisibility(
      supabase
        .from("events")
        .select(EVENT_LIST_COLUMNS)
        .lt("date", window.start)
        .gte("end_date", window.start),
    )
      .order("end_date", { ascending: true })
      .limit(HOME_WEEK_RUNNING_LIMIT),
  ]);
  if (starts.error) throw starts.error;
  if (running.error) throw running.error;
  return {
    starts: (starts.data ?? []) as unknown as HomeWeekEvent[],
    running: (running.data ?? []) as unknown as HomeWeekEvent[],
  };
}

function isEmpty(band: BandRows): boolean {
  return band.starts.length === 0 && band.running.length === 0;
}

export function useHomeWeekEvents(limit = 9): HomeWeekEventsResult {
  const day = centralDateOf();
  const windows = homeWeekWindows();

  const query = useQuery({
    queryKey: ["home-week-events", day, limit],
    queryFn: async (): Promise<{ rows: BandRows; band: HomeWeekBand }> => {
      const weekend = await readBand(windows.weekend, limit);
      if (!isEmpty(weekend) || !windows.weekdays) return { rows: weekend, band: "weekend" };
      return { rows: await readBand(windows.weekdays, limit), band: "weekdays" };
    },
    // "Show more" raises the limit; keep the cards while the longer page loads.
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
    retry: shouldRetry,
  });

  const band = query.data?.band ?? null;
  const refetch = query.refetch;
  const rows = query.data?.rows;
  const events = useMemo(() => (rows ? [...rows.starts, ...rows.running] : []), [rows]);
  return {
    events,
    startCount: rows?.starts.length ?? 0,
    band,
    label: windows.labels[band ?? "weekend"],
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => {
      void refetch();
    },
  };
}
