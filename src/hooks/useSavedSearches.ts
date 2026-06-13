import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { STALE_TIME } from "@/lib/queryConfig";

/**
 * Cross-platform saved-search payload (WEB-FEAT-003 / iOS PARITY-008). The
 * query, owning list tab, alert flag, and the serialized list-page filter
 * string all live inside `saved_searches.filters` (JSONB) so the schema stays
 * shared with the native apps — `params` lets the nightly digest rebuild a
 * deep link back to the exact filtered view (WEB-UX-001 URL state).
 */
export interface SavedSearchFilters {
  query: string;
  tab: string;
  alerts_enabled: boolean;
  /** Serialized URLSearchParams of the list page at save time (e.g. "category=Music&q=jazz"). */
  params?: string;
  [key: string]: unknown;
}

export interface SavedSearchRecord {
  id: string;
  name: string;
  query: string;
  tab: string;
  alertsEnabled: boolean;
  params: string;
  filters: SavedSearchFilters;
  createdAt: string;
}

export interface CreateSavedSearchInput {
  name: string;
  query: string;
  tab: string;
  params?: string;
  alertsEnabled?: boolean;
}

export interface SaveSearchResult {
  success: boolean;
  /** Feature not available on the current tier (free) — show the paywall. */
  needsUpgrade?: boolean;
  /** Tier cap reached (e.g. Insider's 10) — show the paywall. */
  limitReached?: boolean;
  error?: string;
}

function toRecord(row: Record<string, unknown>): SavedSearchRecord {
  const filters = (row.filters ?? {}) as SavedSearchFilters;
  return {
    id: row.id as string,
    name: (row.name as string) ?? "",
    query: typeof filters.query === "string" ? filters.query : "",
    tab: typeof filters.tab === "string" ? filters.tab : "events",
    alertsEnabled: filters.alerts_enabled === true,
    params: typeof filters.params === "string" ? filters.params : "",
    filters,
    createdAt: row.created_at as string,
  };
}

/**
 * Saved searches + alert toggles (WEB-FEAT-003). Server-side enforces the
 * per-tier creation cap via a BEFORE INSERT trigger; this hook surfaces a
 * structured result so the caller can route free users (and tier-cap hits) to
 * the contextual paywall.
 */
export function useSavedSearches() {
  const { user } = useAuth();
  const { hasFeature, limits, tier } = useSubscription();
  const queryClient = useQueryClient();
  const key = ["saved-searches", user?.id];

  const { data: savedSearches = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!user,
    staleTime: STALE_TIME.USER,
    queryFn: async (): Promise<SavedSearchRecord[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("saved_searches")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => toRecord(r as Record<string, unknown>));
    },
  });

  const limit = limits.saved_searches; // -1 = unlimited
  const count = savedSearches.length;
  const canCreate = hasFeature("save_searches") && (limit === -1 || count < limit);
  const remaining = limit === -1 ? "unlimited" : Math.max(0, limit - count);

  const createSavedSearch = async (
    input: CreateSavedSearchInput,
  ): Promise<SaveSearchResult> => {
    if (!user) return { success: false, error: "not_authenticated" };

    // Client gate mirrors the server trigger so free users go straight to the
    // paywall without a wasted round-trip.
    if (!hasFeature("save_searches")) {
      return { success: false, needsUpgrade: true };
    }
    if (limit !== -1 && count >= limit) {
      return { success: false, limitReached: true };
    }

    const filters: SavedSearchFilters = {
      query: input.query ?? "",
      tab: input.tab,
      alerts_enabled: input.alertsEnabled ?? true,
      params: input.params ?? "",
    };

    const { error } = await supabase.from("saved_searches").insert({
      user_id: user.id,
      name: input.name.trim() || input.query || `My ${input.tab} search`,
      filters: filters as unknown as Json,
      use_count: 1,
    });

    if (error) {
      // The trigger raises a check_violation when the cap is exceeded (covers
      // races + non-web insert paths).
      if (
        error.message?.includes("saved_search_limit_reached") ||
        error.code === "23514"
      ) {
        return { success: false, limitReached: true };
      }
      return { success: false, error: error.message };
    }

    await queryClient.invalidateQueries({ queryKey: key });
    return { success: true };
  };

  const toggleAlertsMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const existing = savedSearches.find((s) => s.id === id);
      const nextFilters = {
        ...(existing?.filters ?? {}),
        alerts_enabled: enabled,
      };
      const { error } = await supabase
        .from("saved_searches")
        .update({ filters: nextFilters as unknown as Json })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("saved_searches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return {
    savedSearches,
    isLoading,
    tier,
    limit,
    count,
    remaining,
    canCreate,
    createSavedSearch,
    toggleAlerts: (id: string, enabled: boolean) =>
      toggleAlertsMutation.mutateAsync({ id, enabled }),
    deleteSavedSearch: (id: string) => deleteMutation.mutateAsync(id),
    isMutating: toggleAlertsMutation.isPending || deleteMutation.isPending,
  };
}
