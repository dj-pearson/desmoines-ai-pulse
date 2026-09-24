import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthState } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { GC_TIME } from "@/lib/queryConfig";

export interface UserLevel {
  level: number | null;
  xp: number | null;
}

const LEVEL_STALE_TIME = 5 * 60 * 1000;

/**
 * Level and XP for the header badge, and nothing else.
 *
 * Header used to call useGamification() for these two numbers. That hook runs
 * a six-way Promise.all (reputation, badges, challenges, activities, available
 * badges, leaderboard) in a useEffect, and Header mounts on every page, so each
 * navigation cost six requests to show "Level 3". This is one cached
 * user_reputation read, the same table and filter useGamification already
 * queries, shared by every Header instance through the TanStack cache.
 *
 * A denied or missing row resolves to nulls rather than throwing: the badge is
 * decorative and must never break the header.
 */
export function useUserLevel(): UserLevel {
  const { user } = useAuthState();
  const userId = user?.id ?? null;

  const { data } = useQuery<UserLevel>({
    queryKey: queryKeys.user.level(userId ?? "anonymous"),
    enabled: userId != null,
    staleTime: LEVEL_STALE_TIME,
    gcTime: GC_TIME,
    retry: false,
    queryFn: async () => {
      if (!userId) return { level: null, xp: null };
      const { data: row, error } = await supabase
        .from("user_reputation")
        .select("current_level, experience_points")
        .eq("user_id", userId)
        .maybeSingle();
      if (error || !row) return { level: null, xp: null };
      return { level: row.current_level, xp: row.experience_points };
    },
  });

  return data ?? { level: null, xp: null };
}
