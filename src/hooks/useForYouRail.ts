import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { createLogger } from "@/lib/logger";
import { useUserPreferences } from "./useUserPreferences";
import { FOR_YOU_RAIL_KEY, useHomeShownIds } from "./useHomeShownIds";
import { applyEventVisibility } from "@/lib/eventQuery";
import { EVENT_LIST_COLUMNS } from "@/lib/listColumns";
import { knownPicks, rerankByPicks, withoutIds, type Reranked } from "@/lib/forYouRerank";

const log = createLogger("useForYouRail");

/**
 * Rows for the home For You rail (IOS-DISCOVER-2026-002, home pass-2 WP3).
 *
 * TWO SOURCES.
 *   - Signed in with 5+ recent swipes: get_personalized_recommendations, as
 *     before. That RPC applies none of the three unpublish switches and returns
 *     no sponsorship columns (migration 20260822000002), so its ids go through
 *     one follow-up events read that both drops hidden, merged and archived
 *     rows and brings back is_sponsored / sponsored_until for the badge.
 *     20260929000001 adds the filters to the RPC itself for the shipped apps.
 *   - Everyone else: a plain PostgREST read on `events`, NOT the
 *     get_trending_events RPC. That RPC added 20 for is_featured (a featured
 *     row is a sponsored one or an admin pick since 20260902000004) plus
 *     random()*5, and filtered none of the unpublish switches, so the rail put
 *     paid and hidden rows under "Trending now". This read orders by the
 *     measured events.trending_score (written by calculate_trending_scores),
 *     then by date, with the standard visibility predicate. Same request count,
 *     no deploy.
 *
 * Tonight's events are dropped after the taste re-rank; the Tonight rail
 * above already shows them (item 6).
 */
export interface ForYouRecommendation {
  id: string;
  title: string | null;
  date: string | null;
  event_start_utc?: string | null;
  event_start_local?: string | null;
  category: string | null;
  image_url: string | null;
  venue: string | null;
  location?: string | null;
  city?: string | null;
  price?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_featured: boolean | null;
  is_sponsored?: boolean | null;
  sponsored_until?: string | null;
  /** events.trending_score; null on the personalized path. */
  trending_score?: number | null;
  recommendation_score: number | null;
  recommendation_reason: string | null;
}

export type ForYouSource = "for-you" | "trending";

export interface UseForYouRailResult {
  /**
   * Rows re-ordered by the visitor's taste chips when they have picked any,
   * without tonight's events. `pickReason` is set on each row a pick matched.
   */
  recommendations: Reranked<ForYouRecommendation>[];
  source: ForYouSource;
  /** The chip ids the visitor has picked, in chip order. */
  picks: string[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/** Columns for the anonymous read: the list projection plus the ranking signal. */
const FOR_YOU_COLUMNS = `${EVENT_LIST_COLUMNS}, trending_score`;

async function fetchTrendingRows(limit: number): Promise<ForYouRecommendation[]> {
  const { data, error } = await applyEventVisibility(
    supabase.from("events").select(FOR_YOU_COLUMNS).gte("date", new Date().toISOString()),
  )
    .order("trending_score", { ascending: false, nullsFirst: false })
    .order("date", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown as Array<Omit<ForYouRecommendation, "recommendation_score" | "recommendation_reason">>).map(
    (row) => ({ ...row, recommendation_score: null, recommendation_reason: null }),
  );
}

interface VisibilityRow {
  id: string;
  is_sponsored: boolean | null;
  sponsored_until: string | null;
}

async function fetchPersonalRows(limit: number): Promise<ForYouRecommendation[]> {
  // @ts-ignore -- Supabase SDK strict mode noise
  const { data: rows, error } = await supabase.rpc("get_personalized_recommendations", {
    p_user_lat: null,
    p_user_lon: null,
    p_limit: limit,
  });
  if (error) throw error;
  const recs = (rows ?? []) as ForYouRecommendation[];
  if (recs.length === 0) return recs;

  const { data: flags, error: flagsError } = await applyEventVisibility(
    supabase.from("events").select("id, is_sponsored, sponsored_until"),
  ).in(
    "id",
    recs.map((r) => r.id),
  );
  if (flagsError) throw flagsError;
  const byId = new Map(((flags ?? []) as unknown as VisibilityRow[]).map((f) => [f.id, f]));
  return recs
    .filter((r) => byId.has(r.id))
    .map((r) => ({
      ...r,
      is_sponsored: byId.get(r.id)?.is_sponsored ?? null,
      sponsored_until: byId.get(r.id)?.sponsored_until ?? null,
    }));
}

export function useForYouRail(limit = 12): UseForYouRailResult {
  const { user } = useAuth();
  const { preferences } = useUserPreferences();
  const { tonight } = useHomeShownIds();
  const tags = preferences?.interests?.tags;
  // Joined so the memo below keys on the picks' content, not the array identity.
  const picksKey = knownPicks(tags).join(",");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [...FOR_YOU_RAIL_KEY, user?.id ?? null, limit],
    queryFn: async (): Promise<{ rows: ForYouRecommendation[]; source: ForYouSource }> => {
      // Cold-start probe: count recent swipes within the last 90 days
      let swipeCount = 0;
      if (user?.id) {
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        // @ts-ignore -- Supabase SDK strict mode noise
        const { count, error } = await supabase
          .from("swipe_interactions")
          .select("*", { count: "exact", head: true })
          // @ts-ignore
          .eq("user_id", user.id)
          // @ts-ignore
          .gte("created_at", ninetyDaysAgo);
        // A failed read is not a cold start. Treating it as zero swipes sends a
        // user with a full history down the generic path silently; logging it
        // keeps the degradation visible while still degrading gracefully.
        if (error) {
          log.error("useForYouRail", "Could not count recent swipes", { error });
        }
        swipeCount = count ?? 0;
      }

      if (swipeCount >= 5) {
        return { rows: await fetchPersonalRows(limit), source: "for-you" };
      }
      return { rows: await fetchTrendingRows(limit), source: "trending" };
    },
    staleTime: 5 * 60 * 1000,
  });

  const rows = data?.rows;
  const recommendations = useMemo(() => {
    const picks = picksKey ? picksKey.split(",") : [];
    return withoutIds(rerankByPicks(rows ?? [], picks), tonight);
  }, [rows, picksKey, tonight]);

  return {
    recommendations,
    source: data?.source ?? "trending",
    picks: picksKey ? picksKey.split(",") : [],
    isLoading,
    isError,
    refetch: () => {
      refetch();
    },
  };
}
