import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { createLogger } from "@/lib/logger";

const log = createLogger("useForYouRail");

/**
 * Wraps the get_personalized_recommendations / get_trending_events RPCs
 * added by migration 20260506000010 (IOS-DISCOVER-2026-002). Decides which
 * to call based on the user's recent swipe count so the web home page can
 * mirror the iOS For You rail.
 */
export interface ForYouRecommendation {
  id: string;
  title: string | null;
  date: string | null;
  category: string | null;
  image_url: string | null;
  venue: string | null;
  is_featured: boolean | null;
  recommendation_score: number | null;
  recommendation_reason: string | null;
}

export type ForYouSource = "for-you" | "trending";

export interface UseForYouRailResult {
  recommendations: ForYouRecommendation[];
  source: ForYouSource;
  isLoading: boolean;
  refetch: () => void;
}

export function useForYouRail(limit = 12): UseForYouRailResult {
  const { user } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["for-you-rail", user?.id, limit],
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
        // @ts-ignore -- Supabase SDK strict mode noise
        const { data: rows, error } = await supabase.rpc("get_personalized_recommendations", {
          p_user_lat: null,
          p_user_lon: null,
          p_limit: limit,
        });
        if (error) throw error;
        return { rows: (rows ?? []) as ForYouRecommendation[], source: "for-you" };
      }

      // @ts-ignore -- Supabase SDK strict mode noise
      const { data: rows, error } = await supabase.rpc("get_trending_events", { p_limit: limit });
      if (error) throw error;
      return { rows: (rows ?? []) as ForYouRecommendation[], source: "trending" };
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    recommendations: data?.rows ?? [],
    source: data?.source ?? "trending",
    isLoading,
    refetch: () => {
      refetch();
    },
  };
}
