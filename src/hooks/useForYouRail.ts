import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { createLogger } from "@/lib/logger";
import { useUserPreferences } from "./useUserPreferences";
import { useProfile } from "./useProfile";
import { readOptIn } from "@/lib/communicationPreferences";
import { FOR_YOU_RAIL_KEY, useHomeShownIds } from "./useHomeShownIds";
import { applyEventVisibility } from "@/lib/eventQuery";
import { EVENT_LIST_COLUMNS } from "@/lib/listColumns";
import { upcomingFloorUtc } from "@/lib/timezone";
import { upcomingOrRunningFilter } from "./useEvents";
import { knownPicks, rerankByPicks, withoutIds, type Reranked } from "@/lib/forYouRerank";

const log = createLogger("useForYouRail");

/**
 * Rows for the home For You rail (IOS-DISCOVER-2026-002, home pass-2 WP3).
 *
 * TWO SOURCES.
 *   - Signed in, opted in to "Personalized suggestions", with 5+ recent
 *     swipes: get_personalized_recommendations_v2,
 *     one request. v2 (migration 20261102000002) filters the three unpublish
 *     switches and returns is_sponsored / sponsored_until for the badge. Until
 *     it is applied, v1 plus one follow-up events read that drops hidden,
 *     merged and archived rows and brings back the sponsorship columns
 *     (WEB-PERF-052). The swipe probe is its own cached query, an existence
 *     check rather than a count.
 *   - Everyone else: a plain PostgREST read on `events`, NOT the
 *     get_trending_events RPC. That RPC added 20 for is_featured (a featured
 *     row is a sponsored one or an admin pick since 20260902000004) plus
 *     random()*5, and filtered none of the unpublish switches, so the rail put
 *     paid and hidden rows under "Trending now". This read orders by the
 *     measured events.trending_score (written by calculate_trending_scores),
 *     then by date, with the standard visibility predicate.
 *
 * THE OPT-IN IS READ HERE. The settings switch ("Personalized suggestions",
 * profiles.communication_preferences.event_recommendations, logged to
 * consent_records as personalization_ai) controlled nothing: a user who turned
 * it off still had their swipes and saves ranked into this rail. Only an
 * explicit true counts, the same reading the switch renders (readOptIn), and
 * without it the swipe history is not even probed. The profile is the one the
 * header already loads, so this adds no request. A failed profile read is not
 * consent. The taste chips still re-rank: the visitor picks those on the rail.
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

/** Exported for the unit tests. */
export async function fetchTrendingRows(limit: number): Promise<ForYouRecommendation[]> {
  const { data, error } = await applyEventVisibility(
    supabase.from("events").select(FOR_YOU_COLUMNS),
  )
    // Upcoming or still running, the window every events list uses
    // (WEB-FEAT-062). `date >= now` dropped a multi-day run on its second
    // morning, which is when it trends hardest.
    .or(upcomingOrRunningFilter(upcomingFloorUtc()))
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

/** Swipes in the last 90 days that make a visitor "for-you" rather than trending. */
export const SWIPE_THRESHOLD = 5;

/** Key for the cold-start probe. Not under FOR_YOU_RAIL_KEY: it holds no rows. */
export const FOR_YOU_SWIPES_KEY = ["for-you-swipes"] as const;

/**
 * Whether the user has SWIPE_THRESHOLD or more swipes in the last 90 days.
 *
 * An existence check, not a count: offset SWIPE_THRESHOLD - 1, limit 1 returns
 * a row exactly when there are at least SWIPE_THRESHOLD. count: 'exact' made
 * Postgres count the whole window to answer a yes/no.
 *
 * A failed read is not a cold start. It is logged, so a user with a full
 * history silently landing on the generic path stays visible, and the rail
 * degrades to trending rather than failing.
 */
export async function hasRecentSwipes(userId: string): Promise<boolean> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("swipe_interactions")
    .select("id")
    .eq("user_id", userId)
    .gte("created_at", since)
    .range(SWIPE_THRESHOLD - 1, SWIPE_THRESHOLD - 1);
  if (error) {
    log.error("useForYouRail", "Could not check recent swipes", { error });
    return false;
  }
  return (data?.length ?? 0) > 0;
}


/**
 * Set once v2 answers "no such function", so the rest of the session goes
 * straight to v1 instead of paying a failed request per load. Matters only
 * until migration 20261102000002 is applied in production.
 */
let v2Unavailable = false;

function isMissingFunction(error: { code?: string } | null): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

function hasSponsorFlags(rows: ForYouRecommendation[]): boolean {
  return rows.every((r) => "is_sponsored" in r && "sponsored_until" in r);
}

/**
 * The pre-v2 follow-up: one events read that drops unpublished rows (for a
 * database where 20260929000001 is not applied either) and brings back the
 * sponsorship columns for the badge.
 */
async function withSponsorFlags(recs: ForYouRecommendation[]): Promise<ForYouRecommendation[]> {
  if (recs.length === 0) return recs;
  const { data: flags, error } = await applyEventVisibility(
    supabase.from("events").select("id, is_sponsored, sponsored_until"),
  ).in(
    "id",
    recs.map((r) => r.id),
  );
  if (error) throw error;
  const byId = new Map(((flags ?? []) as unknown as VisibilityRow[]).map((f) => [f.id, f]));
  return recs
    .filter((r) => byId.has(r.id))
    .map((r) => ({
      ...r,
      is_sponsored: byId.get(r.id)?.is_sponsored ?? null,
      sponsored_until: byId.get(r.id)?.sponsored_until ?? null,
    }));
}

/**
 * Personalized rows. One request when get_personalized_recommendations_v2
 * exists, since it filters unpublished rows and returns is_sponsored /
 * sponsored_until itself. Without it (PGRST202), or if its rows lack the
 * flags, v1 or v2 plus the follow-up read, as before. v1 is what the shipped
 * apps call, so it is never changed.
 */
export async function fetchPersonalRows(limit: number): Promise<ForYouRecommendation[]> {
  const args = { p_user_lat: null, p_user_lon: null, p_limit: limit };
  if (!v2Unavailable) {
    // @ts-expect-error -- not in the generated types until 20261102000002 is applied
    const { data, error } = await supabase.rpc("get_personalized_recommendations_v2", args);
    if (!error) {
      const recs = (data ?? []) as ForYouRecommendation[];
      return hasSponsorFlags(recs) ? recs : withSponsorFlags(recs);
    }
    if (!isMissingFunction(error)) throw error;
    v2Unavailable = true;
  }
  const { data, error } = await supabase.rpc("get_personalized_recommendations", args);
  if (error) throw error;
  return withSponsorFlags((data ?? []) as ForYouRecommendation[]);
}

export function useForYouRail(limit = 12): UseForYouRailResult {
  const { user } = useAuth();
  const { preferences } = useUserPreferences();
  const { tonight } = useHomeShownIds();
  const tags = preferences?.interests?.tags;
  // Joined so the memo below keys on the picks' content, not the array identity.
  const picksKey = knownPicks(tags).join(",");
  const userId = user?.id ?? null;
  const { profile, isLoading: profileLoading } = useProfile();
  const optedIn = userId !== null && readOptIn(profile?.communication_preferences, "event_recommendations");
  // Wait for the profile before choosing, so an opted-in user does not get a
  // trending read that is thrown away a moment later.
  const consentKnown = userId === null || !profileLoading;

  // Cold-start probe, cached on its own so a rail refetch does not repeat it.
  const swipes = useQuery({
    queryKey: [...FOR_YOU_SWIPES_KEY, userId],
    queryFn: () => hasRecentSwipes(userId as string),
    enabled: optedIn,
    staleTime: 10 * 60 * 1000,
  });
  const probeDone = consentKnown && (!optedIn || swipes.isSuccess || swipes.isError);
  const source: ForYouSource = optedIn && swipes.data === true ? "for-you" : "trending";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [...FOR_YOU_RAIL_KEY, userId, limit, source],
    queryFn: async (): Promise<{ rows: ForYouRecommendation[]; source: ForYouSource }> => {
      if (source === "for-you") {
        return { rows: await fetchPersonalRows(limit), source };
      }
      return { rows: await fetchTrendingRows(limit), source };
    },
    enabled: probeDone,
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
    // A query waiting on `enabled` reports isLoading false, so the probe counts.
    isLoading: !probeDone || isLoading,
    isError,
    refetch: () => {
      refetch();
    },
  };
}
