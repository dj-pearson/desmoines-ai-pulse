import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { handleError } from "@/lib/errorHandler";

/**
 * Business profile and partnership applications for the signed-in user
 * (business plan WP3 item 5).
 *
 * TanStack queries rather than per-instance useState, so /business and
 * /business-partnership share one cache and a component can tell "still
 * loading" from "there is no row". The old hook started every instance with
 * profile = null and loading = false, which is how the hub flashed "Complete
 * Business Profile" to people who had one.
 *
 * Gone on purpose: advertising_packages (a second price list next to
 * ad_rate_card; /advertise is the one place ads are priced), partnership_benefits
 * (rows promising features nothing implements) and business_analytics (nothing
 * writes it, so every tile read zero).
 */

export interface BusinessProfile {
  id: string;
  user_id: string;
  business_name: string;
  business_type: string;
  description: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  verification_status: string | null;
  partnership_tier: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartnershipApplication {
  id: string;
  business_name: string;
  business_type: string;
  desired_tier: string;
  status: string;
  admin_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

/** What the application form sends. Every column is named; nothing is spread. */
export interface PartnershipApplicationInput {
  business_name: string;
  business_type: string;
  contact_email: string;
  contact_phone?: string;
  website?: string;
  description?: string;
  desired_tier: PartnershipTier;
}

export const PARTNERSHIP_TIERS = ["basic", "premium", "enterprise"] as const;
export type PartnershipTier = (typeof PARTNERSHIP_TIERS)[number];

export const BUSINESS_TYPES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "restaurant", label: "Restaurant or bar" },
  { value: "retail", label: "Shop" },
  { value: "entertainment", label: "Venue or entertainment" },
  { value: "fitness", label: "Fitness and wellness" },
  { value: "professional_services", label: "Professional services" },
  { value: "healthcare", label: "Healthcare" },
  { value: "education", label: "Education" },
  { value: "other", label: "Something else" },
];

export function businessTypeLabel(value: string | null | undefined): string {
  if (!value) return "-";
  return BUSINESS_TYPES.find((t) => t.value === value)?.label ?? value.replace(/_/g, " ");
}

export const APPLICATION_STATUS_LABEL: Record<string, string> = {
  pending: "Received",
  under_review: "Being reviewed",
  approved: "Approved",
  rejected: "Not approved",
};

export function applicationStatusLabel(status: string | null | undefined): string {
  if (!status) return "Received";
  return APPLICATION_STATUS_LABEL[status] ?? status.replace(/_/g, " ");
}

const PROFILE_COLUMNS =
  "id, user_id, business_name, business_type, description, website, phone, email, verification_status, partnership_tier, created_at, updated_at";

const APPLICATION_COLUMNS =
  "id, business_name, business_type, desired_tier, status, admin_notes, reviewed_at, created_at";

export function useBusinessProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["business-profile", user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<BusinessProfile | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("business_profiles")
        .select(PROFILE_COLUMNS)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return (data as BusinessProfile | null) ?? null;
    },
  });
}

export function usePartnershipApplications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["partnership-applications", user?.id],
    enabled: !!user,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<PartnershipApplication[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("partnership_applications")
        .select(APPLICATION_COLUMNS)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PartnershipApplication[];
    },
  });
}

export function useSubmitPartnershipApplication() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: PartnershipApplicationInput): Promise<void> => {
      if (!user) throw new Error("Sign in to apply.");
      // Named columns only. status, admin_notes, reviewed_by and reviewed_at
      // are the reviewer's, so the browser never sends them.
      const row = {
        user_id: user.id,
        business_name: input.business_name.trim(),
        business_type: input.business_type,
        contact_email: input.contact_email.trim(),
        contact_phone: input.contact_phone?.trim() || null,
        website: input.website?.trim() || null,
        description: input.description?.trim() || null,
        desired_tier: input.desired_tier,
      };
      const { error } = await supabase.from("partnership_applications").insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partnership-applications", user?.id] });
    },
    onError: (error) => {
      handleError(error, { component: "useBusinessPartnership", action: "submitApplication" });
    },
  });
}

/**
 * The two reads together, for callers that want both. isLoading is true only
 * while a read is actually in flight for a signed-in user.
 */
export function useBusinessPartnership() {
  const profile = useBusinessProfile();
  const applications = usePartnershipApplications();

  return {
    businessProfile: profile.data ?? null,
    applications: applications.data ?? [],
    isLoading: profile.isLoading || applications.isLoading,
    isError: profile.isError || applications.isError,
    error: profile.error ?? applications.error,
    refetch: () => Promise.all([profile.refetch(), applications.refetch()]),
  };
}
