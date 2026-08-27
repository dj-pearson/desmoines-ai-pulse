import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";

export type SavedSearchRow = Database["public"]["Tables"]["saved_searches"]["Row"];

/** The list-page filter keys we persist + deep-link back to (WEB-UX-001). */
export const SAVED_SEARCH_FILTER_KEYS = ["q", "category", "location", "price", "preset", "sort"] as const;
export type SavedSearchFilters = Partial<Record<(typeof SAVED_SEARCH_FILTER_KEYS)[number], string>>;

/** Build a shareable /events deep link from saved filters. */
export function buildSavedSearchUrl(filters: SavedSearchFilters): string {
  const params = new URLSearchParams();
  for (const key of SAVED_SEARCH_FILTER_KEYS) {
    const v = filters[key];
    if (v && v !== "all" && v !== "any-location" && v !== "any-price") params.set(key, v);
  }
  const qs = params.toString();
  return `/events${qs ? `?${qs}` : ""}`;
}

/** Human summary of a saved search's filters for list display. */
export function describeSavedSearch(filters: SavedSearchFilters): string {
  const parts: string[] = [];
  if (filters.q) parts.push(`“${filters.q}”`);
  if (filters.category && filters.category !== "all") parts.push(filters.category);
  if (filters.location && filters.location !== "any-location") parts.push(filters.location);
  if (filters.price && filters.price !== "any-price") parts.push(filters.price.replace(/-/g, " "));
  if (filters.preset) parts.push(filters.preset.replace(/-/g, " "));
  return parts.length ? parts.join(" · ") : "All events";
}

export class SavedSearchLimitError extends Error {
  constructor() {
    super("saved_search_limit_reached");
    this.name = "SavedSearchLimitError";
  }
}

export function useSavedSearchAlerts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const searchesQuery = useQuery({
    queryKey: ["saved-search-alerts", userId],
    enabled: !!userId,
    queryFn: async (): Promise<SavedSearchRow[]> => {
      const { data, error } = await supabase
        .from("saved_searches")
        .select("*")
        .eq("user_id", userId!)
        .eq("search_type", "event_list")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // WEB-BE-032 / WEB-LEGAL-012: the error used to be discarded here, and the
  // direction it failed in is the problem. On any failure `data` is undefined,
  // `undefined !== false` is true, and the master switch renders ON - so a user
  // who had turned alerts OFF is shown a UI asserting they are on. Surfacing
  // the error lets the switch say it does not know instead of guessing, and
  // absence of a row still means opted IN, which is what every sender assumes.
  const alertsPrefQuery = useQuery({
    queryKey: ["event-alerts-pref", userId],
    enabled: !!userId,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("user_email_preferences")
        .select("event_alerts_enabled")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data?.event_alerts_enabled !== false;
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["saved-search-alerts", userId] });

  const saveSearch = useMutation({
    mutationFn: async ({ name, filters }: { name: string; filters: SavedSearchFilters }) => {
      const { data, error } = await supabase.rpc("create_event_saved_search", {
        p_name: name,
        p_filters: filters as never,
      });
      if (error) {
        if (error.message?.includes("saved_search_limit_reached")) throw new SavedSearchLimitError();
        throw error;
      }
      return data;
    },
    onSuccess: invalidate,
  });

  const toggleAlerts = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("saved_searches")
        .update({ alerts_enabled: enabled })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteSearch = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("saved_searches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const setAlertsPref = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from("user_email_preferences")
        .upsert(
          { user_id: userId!, event_alerts_enabled: enabled, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event-alerts-pref", userId] }),
  });

  return {
    searches: searchesQuery.data ?? [],
    isLoading: searchesQuery.isLoading,
    alertsEnabledGlobally: alertsPrefQuery.data ?? true,
    /** True while the stored preference could not be read. The switch above is
     *  showing a default, not the user's choice - do not present it as theirs. */
    alertsPrefUnavailable: alertsPrefQuery.isError,
    alertsPrefLoading: alertsPrefQuery.isLoading,
    saveSearch,
    toggleAlerts,
    deleteSearch,
    setAlertsPref,
  };
}
