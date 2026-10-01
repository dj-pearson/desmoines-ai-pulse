/**
 * Every row of one annual series, for /events/series/:slug (SEO-043).
 *
 * WHY THIS READ DOES NOT GO THROUGH applyEventVisibility. A series page lists
 * past editions, and a past edition is precisely a row the stale sweep has
 * hidden. So this selects is_hidden, hidden_at and archived_at and lets
 * buildSeriesView (src/lib/eventSeriesView.ts) decide per row: a sweep-hidden
 * edition is listed without a link, a moderator-hidden one is dropped, an
 * archived one is linked to its past-event page. Merged duplicates are
 * excluded here, since their survivor is the row that counts.
 *
 * The title filter is a loose ilike per alias; buildSeriesView applies the
 * exact match. 200 rows is several years of even a nightly series.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EVENT_LIST_COLUMNS } from "@/lib/listColumns";
import { STALE_TIME } from "@/lib/queryConfig";
import { seriesTitlePatterns, type EventSeriesDef } from "@/lib/eventSeries";
import type { SeriesEventRow } from "@/lib/eventSeriesView";

const SERIES_ROW_LIMIT = 200;

const NO_ROWS: SeriesEventRow[] = [];

export function useEventSeriesPage(def: EventSeriesDef | null) {
  const query = useQuery({
    queryKey: ["event-series-page", def?.slug ?? null],
    enabled: def !== null,
    staleTime: STALE_TIME.CONTENT_LIST,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        // Both switches named in the select: check-event-unpublish-filters reads
        // this chain, and the decision on each is buildSeriesView's.
        .select(`${EVENT_LIST_COLUMNS}, is_hidden, hidden_at, archived_at, source_url_broken`)
        .neq("is_merged", true)
        .or(seriesTitlePatterns(def as EventSeriesDef).join(","))
        .order("date", { ascending: true })
        .limit(SERIES_ROW_LIMIT);
      if (error) throw error;
      return (data ?? []) as unknown as SeriesEventRow[];
    },
  });

  return {
    rows: query.data ?? NO_ROWS,
    isLoading: query.isLoading && query.fetchStatus !== "idle",
    error: query.error,
    refetch: query.refetch,
  };
}
