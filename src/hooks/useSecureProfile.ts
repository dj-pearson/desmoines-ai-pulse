import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useAuthSecurity } from "./useAuthSecurity";
import { createLogger } from '@/lib/logger';

const log = createLogger('useSecureProfile');

export interface SecureUserProfile {
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
  user_role: 'user' | 'moderator' | 'admin' | 'root_admin' | null;
}

interface SecurityContext {
  canViewProfile: boolean;
  canEditProfile: boolean;
  isOwnProfile: boolean;
  isAdminAccess: boolean;
}

export function useSecureProfile(targetUserId?: string) {
  const [profile, setProfile] = useState<SecureUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [securityContext, setSecurityContext] = useState<SecurityContext>({
    canViewProfile: false,
    canEditProfile: false,
    isOwnProfile: false,
    isAdminAccess: false,
  });
  
  const { user, isAdmin } = useAuth();
  const { validateInput } = useAuthSecurity();

  // Use current user if no target user specified
  const effectiveUserId = targetUserId || user?.id;

  const fetchProfile = async () => {
    if (!user || !effectiveUserId) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const isOwnProfile = effectiveUserId === user.id;
      const isAdminAccess = isAdmin && !isOwnProfile;

      // Set security context
      setSecurityContext({
        canViewProfile: isOwnProfile || isAdmin,
        canEditProfile: isOwnProfile || isAdmin,
        isOwnProfile,
        isAdminAccess,
      });

      // Use the secure function to get profile data
      const { data, error } = await supabase.rpc('get_user_profile_safe', {
        target_user_id: effectiveUserId
      });

      if (error) {
        log.error("Error fetching secure profile", { action: 'fetchProfile', metadata: { error } });
        setError(error.message);
        return;
      }

      if (!data || data.length === 0) {
        // Profile doesn't exist, create it only if it's the user's own profile
        if (isOwnProfile) {
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
          setError("Profile not found");
        }
      } else {
        setProfile(data[0]);
      }
    } catch (error) {
      log.error("Error fetching secure profile", { action: 'fetchProfile', metadata: { error } });
      setError(error instanceof Error ? error.message : "Failed to fetch profile");
    } finally {
      setIsLoading(false);
    }
  };

  const updateProfile = async (updates: Partial<Omit<SecureUserProfile, "id" | "user_id" | "created_at" | "updated_at">>) => {
    if (!user || !effectiveUserId) {
      throw new Error("User not authenticated");
    }

    if (!securityContext.canEditProfile) {
      throw new Error("Insufficient permissions to edit this profile");
    }

    // Validate inputs before updating
    const validationErrors: string[] = [];
    
    if (updates.first_name !== undefined) {
      const validation = validateInput('firstName', updates.first_name || '');
      if (!validation.isValid) validationErrors.push(...validation.errors);
    }
    
    if (updates.last_name !== undefined) {
      const validation = validateInput('lastName', updates.last_name || '');
      if (!validation.isValid) validationErrors.push(...validation.errors);
    }
    
    if (updates.phone !== undefined) {
      const validation = validateInput('phone', updates.phone || '');
      if (!validation.isValid) validationErrors.push(...validation.errors);
    }
    
    if (updates.email !== undefined) {
      const validation = validateInput('email', updates.email || '');
      if (!validation.isValid) validationErrors.push(...validation.errors);
    }
    
    if (updates.location !== undefined) {
      const validation = validateInput('location', updates.location || '');
      if (!validation.isValid) validationErrors.push(...validation.errors);
    }

    if (validationErrors.length > 0) {
      throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("user_id", effectiveUserId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      setProfile(data);
      return data;
    } catch (error) {
      log.error("Error updating secure profile", { action: 'updateProfile', metadata: { error } });
      throw error;
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [user, effectiveUserId]);

  return {
    profile,
    isLoading,
    error,
    updateProfile,
    refetch: fetchProfile,
    securityContext,
    canViewProfile: securityContext.canViewProfile,
    canEditProfile: securityContext.canEditProfile,
    isOwnProfile: securityContext.isOwnProfile,
    isAdminAccess: securityContext.isAdminAccess,
  };
}