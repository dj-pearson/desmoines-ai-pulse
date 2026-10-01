/**
 * Events for the Home dashboard's events group (home pass-2 WP3 item 5).
 *
 * Tomorrow's Central start through the end of the coming Sunday, weekend
 * first. One request in the ordinary case: the weekend window. Only when the
 * weekend has nothing listed does it ask for the weekdays before it, so the
 * group always has one honest heading ("This weekend" or "Later this week")
 * instead of a mix a reorder could not fill.
 *
 * No exact count (the block renders no totals), the list projection, and the
 * standard visibility predicate (applyEventVisibility).
 *
 * The key carries the Central date, so it rolls over at midnight rather than
 * on every render.
 */
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

export interface HomeWeekEventsResult {
  events: HomeWeekEvent[];
  /** Which window the rows came from; null before the first answer. */
  band: HomeWeekBand | null;
  /** Heading for the group, matching `band`. */
  label: string;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}

async function readWindow(window: CentralWindow, limit: number): Promise<HomeWeekEvent[]> {
  const { data, error } = await applyEventVisibility(
    supabase
      .from("events")
      .select(EVENT_LIST_COLUMNS)
      .gte("date", window.start)
      .lte("date", window.end),
  )
    .order("date", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as HomeWeekEvent[];
}

export function useHomeWeekEvents(limit = 9): HomeWeekEventsResult {
  const day = centralDateOf();
  const windows = homeWeekWindows();

  const query = useQuery({
    queryKey: ["home-week-events", day, limit],
    queryFn: async (): Promise<{ rows: HomeWeekEvent[]; band: HomeWeekBand }> => {
      const weekend = await readWindow(windows.weekend, limit);
      if (weekend.length > 0 || !windows.weekdays) return { rows: weekend, band: "weekend" };
      return { rows: await readWindow(windows.weekdays, limit), band: "weekdays" };
    },
    // "Show more" raises the limit; keep the cards while the longer page loads.
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
    retry: shouldRetry,
  });

  const band = query.data?.band ?? null;
  const refetch = query.refetch;
  return {
    events: query.data?.rows ?? [],
    band,
    label: windows.labels[band ?? "weekend"],
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => {
      void refetch();
    },
  };
}
