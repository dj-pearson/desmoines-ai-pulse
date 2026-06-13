import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { createLogger } from '@/lib/logger';

const log = createLogger('useAttractions');

type Attraction = Database["public"]["Tables"]["attractions"]["Row"];
type AttractionInsert = Database["public"]["Tables"]["attractions"]["Insert"];
type AttractionUpdate = Database["public"]["Tables"]["attractions"]["Update"];

// WEB-PERF-001: list path fetches only card + admin-manager columns, not
// select('*'). Heavy detail-only fields (seo_*, geo_summary/geo_key_facts/
// geo_faq) are dropped from list payloads. The attraction DETAIL page runs its
// own select('*') query. `satisfies` validates names against the Row type.
const ATTRACTION_LIST_COLUMNS = [
  "id",
  "name",
  "type",
  "image_url",
  "rating",
  "location",
  "description",
  "is_featured",
  "is_active",
  "address",
  "hours_summary",
  "hours",
  "is_indoor",
  "is_kid_friendly",
  "is_free",
  "accessibility_notes",
  "website",
  "latitude",
  "longitude",
  "created_at",
  "updated_at",
] satisfies readonly (keyof Attraction)[];

const ATTRACTION_LIST_SELECT = ATTRACTION_LIST_COLUMNS.join(", ");

interface AttractionsState {
  attractions: Attraction[];
  isLoading: boolean;
  error: string | null;
  totalCount: number;
}

interface AttractionFilters {
  search?: string;
  type?: string;
  minRating?: number;
  featuredOnly?: boolean;
  /** Admin-only: true = indoor-only, false = outdoor-only, undefined = both */
  indoorOnly?: boolean;
  /** Admin-only: true = kid-friendly only, false = not-kid-friendly only */
  kidFriendlyOnly?: boolean;
  /** Admin-only: true = free admission only */
  freeOnly?: boolean;
  /** Admin-only: when false, includes is_active=false rows. Defaults to true (active only) for back-compat. */
  activeOnly?: boolean;
  sortBy?: "newest" | "updated" | "alphabetical" | "rating";
  limit?: number;
  offset?: number;
  /**
   * WEB-PERF-001: list payloads are column-projected to card + admin-manager
   * fields by default. Surfaces needing the heavy detail fields (ContentTable's
   * SEO column) pass `fullColumns: true` to select('*').
   */
  fullColumns?: boolean;
}

export function useAttractions(filters: AttractionFilters = {}) {
  const [state, setState] = useState<AttractionsState>({
    attractions: [],
    isLoading: true,
    error: null,
    totalCount: 0,
  });

  const fetchAttractions = async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      let query = supabase
        .from("attractions")
        .select(filters.fullColumns ? "*" : ATTRACTION_LIST_SELECT, {
          count: "exact",
        });

      // Default to active rows only; admin callers can pass false to see all.
      if (filters.activeOnly !== false) {
        query = query.eq("is_active", true);
      }

      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,type.ilike.%${filters.search}%,location.ilike.%${filters.search}%`
        );
      }

      if (filters.type && filters.type !== "all") {
        query = query.eq("type", filters.type);
      }

      if (filters.minRating) {
        query = query.gte("rating", filters.minRating);
      }

      if (filters.featuredOnly) {
        query = query.eq("is_featured", true);
      }

      if (filters.indoorOnly === true) {
        query = query.eq("is_indoor", true);
      } else if (filters.indoorOnly === false) {
        query = query.eq("is_indoor", false);
      }

      if (filters.kidFriendlyOnly === true) {
        query = query.eq("is_kid_friendly", true);
      }

      if (filters.freeOnly === true) {
        query = query.eq("is_free", true);
      }

      switch (filters.sortBy ?? "newest") {
        case "updated":
          query = query.order("updated_at", { ascending: false });
          break;
        case "alphabetical":
          query = query.order("name", { ascending: true });
          break;
        case "rating":
          query = query.order("rating", { ascending: false, nullsFirst: false });
          break;
        case "newest":
        default:
          query = query.order("created_at", { ascending: false });
          break;
      }

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      if (filters.offset) {
        query = query.range(
          filters.offset,
          filters.offset + (filters.limit || 10) - 1
        );
      }

      // .returns<Attraction[]>() keeps the full Row type for consumers even
      // though the select string is a runtime-projected column list (no `any`).
      const { data, error, count } = await query.returns<Attraction[]>();

      if (error) {
        throw error;
      }

      setState({
        attractions: data || [],
        isLoading: false,
        error: null,
        totalCount: count || 0,
      });
    } catch (error) {
      log.error('fetchAttractions', 'Error fetching attractions', { error });
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch attractions",
      }));
    }
  };

  const createAttraction = async (attraction: AttractionInsert) => {
    try {
      const { data, error } = await supabase
        .from("attractions")
        .insert(attraction)
        .select()
        .single();

      if (error) throw error;

      fetchAttractions();
      return data;
    } catch (error) {
      log.error('createAttraction', 'Error creating attraction', { error });
      throw error;
    }
  };

  const updateAttraction = async (id: string, updates: AttractionUpdate) => {
    try {
      const { data, error } = await supabase
        .from("attractions")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      fetchAttractions();
      return data;
    } catch (error) {
      log.error('updateAttraction', 'Error updating attraction', { error });
      throw error;
    }
  };

  const deleteAttraction = async (id: string) => {
    try {
      const { error } = await supabase.from("attractions").delete().eq("id", id);

      if (error) throw error;

      fetchAttractions();
    } catch (error) {
      log.error('deleteAttraction', 'Error deleting attraction', { error });
      throw error;
    }
  };

  useEffect(() => {
    fetchAttractions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.search,
    filters.type,
    filters.minRating,
    filters.featuredOnly,
    filters.indoorOnly,
    filters.kidFriendlyOnly,
    filters.freeOnly,
    filters.activeOnly,
    filters.sortBy,
    filters.limit,
    filters.offset,
    filters.fullColumns,
  ]);

  return {
    ...state,
    refetch: fetchAttractions,
    createAttraction,
    updateAttraction,
    deleteAttraction,
  };
}