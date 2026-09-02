import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { createLogger } from "@/lib/logger";
import { Database } from "@/integrations/supabase/types";

const logger = createLogger("useProfile");

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const fetchProfile = async () => {
    if (!user) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        logger.error('fetchProfile', 'Error fetching profile', { error });
        setError(error.message);
        return;
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

        if (createError) {
          logger.error('fetchProfile', 'Error creating profile', { error: createError });
          setError(createError.message);
          return;
        }

        setProfile(newProfile);
      } else {
        setProfile(data);
      }
    } catch (error) {
      logger.error('fetchProfile', 'Error fetching profile', { error });
      setError(error instanceof Error ? error.message : "Failed to fetch profile");
    } finally {
      setIsLoading(false);
    }
  };

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

      setProfile(data);
      return data;
    } catch (error) {
      logger.error('updateProfile', 'Error updating profile', { error });
      throw error;
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [user]);

  return {
    profile,
    isLoading,
    error,
    updateProfile,
    refetch: fetchProfile,
  };
}