import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { STALE_TIME } from "@/lib/queryConfig";

/**
 * How many things the signed-in person has saved, counted the way the server
 * caps it (account plan WP3 item 5).
 *
 * The plan-limit trigger counts event favorites in `user_event_interactions`
 * PLUS every row in `content_favorites` (20260918000001_enforce_plan_limits.sql,
 * lines 96-98). The dashboard used `useFavorites`, which counts events only, so
 * someone with two saved restaurants and one event read "1 saved" while the
 * server refused their fourth save on the Free plan. It also pulled in
 * useGamification's six-way fetch for one number.
 *
 * Two count-only HEAD requests, summed. A failure is an error, never a zero.
 * The limit still comes from the client plan constant; D17 moves it to
 * `entitled_plan_limit` once that migration is applied.
 */
export function useSavedCount() {
  const { user } = useAuth();
  const userId = user?.id;

  const query = useQuery({
    queryKey: ["saved-count", userId],
    enabled: !!userId,
    staleTime: STALE_TIME.USER,
    queryFn: async (): Promise<number> => {
      if (!userId) return 0;
      const [events, places] = await Promise.all([
        supabase
          .from("user_event_interactions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("interaction_type", "favorite"),
        supabase
          .from("content_favorites")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
      ]);
      if (events.error) throw events.error;
      if (places.error) throw places.error;
      if (typeof events.count !== "number" || typeof places.count !== "number") {
        // A HEAD answer with no Content-Range count is not "none saved".
        throw new Error("Saved count unavailable");
      }
      return events.count + places.count;
    },
  });

  return {
    count: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
  };
}
