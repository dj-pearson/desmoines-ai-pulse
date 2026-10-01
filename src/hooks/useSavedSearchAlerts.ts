import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";
import { isPlanLimitError } from "@/lib/planLimitError";
import {
  normalizeSavedSearch,
  type NormalizedSavedSearch,
  type SavedSearchFilters,
} from "@/lib/savedSearchFilters";

export type SavedSearchRow = Database["public"]["Tables"]["saved_searches"]["Row"];

// The filter shape and its readers live in src/lib/savedSearchFilters.ts so a
// unit test can reach them without a Supabase client. Re-exported here because
// SaveSearchButton and older callers import them from this hook.
export {
  SAVED_SEARCH_FILTER_KEYS,
  buildSavedSearchUrl,
  describeSavedSearch,
  type SavedSearchFilters,
} from "@/lib/savedSearchFilters";

/** A saved_searches row plus the one reading of its filters the UI uses. */
export interface SavedSearchListItem extends SavedSearchRow {
  normalized: NormalizedSavedSearch;
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
    // Every row the user has, whatever wrote it (search.md WP3 item 3). This
    // used to filter to search_type = 'event_list', so rows from /search/advanced
    // and the iOS non-Events tabs counted toward the plan cap
    // (20260918000001_enforce_plan_limits.sql) while no screen showed them.
    queryFn: async (): Promise<SavedSearchListItem[]> => {
      const { data, error } = await supabase
        .from("saved_searches")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({ ...row, normalized: normalizeSavedSearch(row) }));
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
        // Two server-side refusals now exist for the same rule: this RPC's own
        // check, and the BEFORE INSERT trigger from WEB-FEAT-017 that also
        // covers a direct .insert() into saved_searches. The RPC raises first
        // on this path; the trigger is recognised so the UI is right whichever
        // one answers.
        if (
          error.message?.includes("saved_search_limit_reached") ||
          isPlanLimitError(error)
        ) {
          throw new SavedSearchLimitError();
        }
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
