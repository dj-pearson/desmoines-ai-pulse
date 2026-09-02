import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { createLogger } from "@/lib/logger";
import { Database } from "@/integrations/supabase/types";
import { queryKeys } from "@/lib/queryKeys";
import { STALE_TIME, GC_TIME } from "@/lib/queryConfig";

const logger = createLogger("useProfile");

/**
 * Derived from the generated schema rather than hand-maintained (WEB-CI-007).
 *
 * The previous hand-written interface had drifted: it declared
 * `interests: string[]` where the column is nullable and
 * `communication_preferences: any` where it is Json, so a row read straight from
 * `profiles` did not satisfy the type the hook claimed to hold. Aliasing the Row
 * type means it cannot drift again — a schema change surfaces at compile time.
 *
 * Per CLAUDE.md: prefer the generated Supabase types over local redefinitions.
 */
export type UserProfile = Database["public"]["Tables"]["profiles"]["Row"];

export function useProfile() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // WEB-PERF-028. This fetched in useEffect with useState, so the profile was
  // refetched on every mount and was invisible to PrerenderSignal, which counts
  // TanStack queries only.
  //
  // `enabled` replaces the `if (!user) return` guard: with no user there is no
  // profile to fetch, and the query simply does not run.
  const { data: profile, isLoading, error } = useQuery<UserProfile | null>({
    queryKey: queryKeys.user.profile(user?.id ?? "anonymous"),
    enabled: !!user,
    staleTime: STALE_TIME.CONTENT_LIST,
    gcTime: GC_TIME,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        logger.error('fetchProfile', 'Error fetching profile', { error });
        throw error;
      }

      if (!data) {
        // WEB-AUTH-002. The profile is normally created by the handle_new_user
        // trigger the moment the auth user is inserted, so reaching here means
        // an account that predates the trigger, or a race with it.
        //
        // This was a plain .insert(), and two components mounting on first
        // login both saw no row and both inserted: one won, the other got a
        // duplicate-key error and left the hook in its error state with no
        // profile. An upsert that ignores duplicates makes the loser a no-op,
        // and the re-read below picks up whichever row exists.
        const { error: createError } = await supabase
          .from("profiles")
          .upsert(
            {
              user_id: user.id,
              email: user.email,
              first_name: user.user_metadata?.first_name || null,
              last_name: user.user_metadata?.last_name || null,
            },
            { onConflict: "user_id", ignoreDuplicates: true }
          );

        // ignoreDuplicates means the winner's row is not returned to the
        // loser, so read it back rather than trusting what the write returned.
        const { data: newProfile } = await supabase
          .from("profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        // An insert error that still leaves a row behind is not a failure --
        // that is exactly the losing side of the race described above. Only
        // report it when the read-back also came back empty.
        if (createError && !newProfile) {
          logger.error('fetchProfile', 'Error creating profile', { error: createError });
          throw createError;
        }

        return (newProfile ?? null) as UserProfile | null;
      }
      return data as UserProfile;
    },
  });

  /** Re-read the profile. Kept as `refetch` for the callers that already use it. */
  const fetchProfile = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.user.all });
  }, [queryClient]);

  const updateProfile = async (updates: Partial<Omit<UserProfile, "id" | "user_id" | "created_at" | "updated_at">>) => {
    if (!user) {
      throw new Error("User not authenticated");
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      queryClient.setQueryData(queryKeys.user.profile(user.id), data);
      return data;
    } catch (error) {
      logger.error('updateProfile', 'Error updating profile', { error });
      throw error;
    }
  };


  // The exact surface callers already read.
  return {
    profile: profile ?? null,
    isLoading,
    error: error ? (error instanceof Error ? error.message : "Failed to fetch profile") : null,
    updateProfile,
    refetch: fetchProfile,
  };
}