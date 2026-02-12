import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { Database } from "@/integrations/supabase/types";
import { createLogger } from '@/lib/logger';

const log = createLogger('useProfile');

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export interface UserProfile {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  communication_preferences: any;
  interests: string[];
  location: string | null;
  created_at: string;
  updated_at: string;
}

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
        log.error("Error fetching profile", { action: 'fetchProfile', metadata: { error } });
        setError(error.message);
        return;
      }

      if (!data) {
        // Profile doesn't exist, create it
        const { data: newProfile, error: createError } = await supabase
          .from("profiles")
          .insert({
            user_id: user.id,
            email: user.email,
            first_name: user.user_metadata?.first_name || null,
            last_name: user.user_metadata?.last_name || null,
          })
          .select()
          .single();

        if (createError) {
          log.error("Error creating profile", { action: 'fetchProfile', metadata: { error: createError } });
          setError(createError.message);
          return;
        }

        setProfile(newProfile);
      } else {
        setProfile(data);
      }
    } catch (error) {
      log.error("Error fetching profile", { action: 'fetchProfile', metadata: { error } });
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
      log.error("Error updating profile", { action: 'updateProfile', metadata: { error } });
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