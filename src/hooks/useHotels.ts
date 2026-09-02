import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { HOTEL_LIST_COLUMNS } from "@/lib/listColumns";
import { STALE_TIME, GC_TIME } from "@/lib/queryConfig";
import { createLogger } from "@/lib/logger";
import { Database } from "@/integrations/supabase/types";

const logger = createLogger("useHotels");

type Hotel = Database["public"]["Tables"]["hotels"]["Row"];
type HotelInsert = Database["public"]["Tables"]["hotels"]["Insert"];
type HotelUpdate = Database["public"]["Tables"]["hotels"]["Update"];

interface HotelFilters {
  search?: string;
  area?: string[];
  priceRange?: string[];
  hotelType?: string[];
  amenities?: string[];
  starRating?: number;
  sortBy?:
    | "featured"
    | "price_low"
    | "price_high"
    | "rating"
    | "alphabetical"
    | "newest"
    | "updated";
  featuredOnly?: boolean;
  activeOnly?: boolean;
  /** Admin-only filter: undefined = ignore, true = require affiliate_url, false = require null */
  hasAffiliate?: boolean;
  limit?: number;
  offset?: number;
}

export function useHotels(filters: HotelFilters = {}) {
  const queryClient = useQueryClient();

  // WEB-PERF-028. This was useState + useEffect: nothing cached across
  // navigation, a refetch on every mount, and -- because PrerenderSignal
  // publishes data-queries-settled from useIsFetching(), a count of TanStack
  // queries only -- a route that reported settled while its request was still
  // in flight. That is how prerender.mjs captured a skeleton on 2 of 4 builds.
  //
  // The generic is explicit: inferred from the return, `hotels` would narrow to
  // the queryFn's own shape rather than the table Row, and callers reading a
  // column would stop compiling.
  const { data, isLoading, error } = useQuery<{
    hotels: Hotel[];
    totalCount: number;
  }>({
    queryKey: queryKeys.hotels.list(filters as Record<string, unknown>),
    staleTime: STALE_TIME.CONTENT_LIST,
    gcTime: GC_TIME,
    queryFn: async () => {
    try {

      // WEB-PERF-028 AC3. Was select("*"), which pulled four SEO fields, three
      // GEO fields and the gallery array into every card payload for a list
      // that renders none of them.
      let query = supabase
        .from("hotels")
        .select(HOTEL_LIST_COLUMNS, { count: "exact" });

      // Default to active only
      if (filters.activeOnly !== false) {
        query = query.eq("is_active", true);
      }

      // Search by name, description, area, chain
      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,description.ilike.%${filters.search}%,area.ilike.%${filters.search}%,chain_name.ilike.%${filters.search}%`
        );
      }

      // Area filter
      if (filters.area && filters.area.length > 0) {
        query = query.in("area", filters.area);
      }

      // Price range filter
      if (filters.priceRange && filters.priceRange.length > 0) {
        query = query.in("price_range", filters.priceRange);
      }

      // Hotel type filter
      if (filters.hotelType && filters.hotelType.length > 0) {
        query = query.in("hotel_type", filters.hotelType);
      }

      // Star rating filter
      if (filters.starRating) {
        query = query.gte("star_rating", filters.starRating);
      }

      // Amenities filter (contains any of the specified amenities)
      if (filters.amenities && filters.amenities.length > 0) {
        query = query.overlaps("amenities", filters.amenities);
      }

      // Featured only
      if (filters.featuredOnly) {
        query = query.eq("is_featured", true);
      }

      // Has-affiliate filter (admin-only)
      if (filters.hasAffiliate === true) {
        query = query.not("affiliate_url", "is", null);
      } else if (filters.hasAffiliate === false) {
        query = query.is("affiliate_url", null);
      }

      // Sorting
      const sortBy = filters.sortBy || "featured";
      switch (sortBy) {
        case "featured":
          query = query
            .order("is_featured", { ascending: false })
            .order("sort_order", { ascending: true })
            .order("name", { ascending: true });
          break;
        case "price_low":
          query = query
            .order("avg_nightly_rate", { ascending: true, nullsFirst: false })
            .order("name", { ascending: true });
          break;
        case "price_high":
          query = query
            .order("avg_nightly_rate", { ascending: false, nullsFirst: false })
            .order("name", { ascending: true });
          break;
        case "rating":
          query = query
            .order("star_rating", { ascending: false, nullsFirst: false })
            .order("name", { ascending: true });
          break;
        case "alphabetical":
          query = query.order("name", { ascending: true });
          break;
        case "newest":
          query = query.order("created_at", { ascending: false });
          break;
        case "updated":
          query = query.order("updated_at", { ascending: false });
          break;
        default:
          query = query
            .order("is_featured", { ascending: false })
            .order("sort_order", { ascending: true });
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

      const { data, error, count } = await query;

      if (error) {
        throw error;
      }

      return {
        hotels: (data || []) as unknown as Hotel[],
        totalCount: count || 0,
      };
    } catch (error) {
      logger.error('fetchHotels', 'Error fetching hotels', { error });
      // Rethrown rather than swallowed: TanStack owns `error` now, and a query
      // that resolves with an empty list would otherwise be indistinguishable
      // from one that failed.
      throw error;
    }
    },
  });

  /** Re-run this list. The mutations below call it so a write shows immediately. */
  const fetchHotels = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.hotels.lists() });
  }, [queryClient]);


  const createHotel = async (hotel: HotelInsert) => {
    try {
      const { data, error } = await supabase
        .from("hotels")
        .insert(hotel)
        .select()
        .single();

      if (error) throw error;

      fetchHotels();
      return data;
    } catch (error) {
      logger.error('createHotel', 'Error creating hotel', { error });
      throw error;
    }
  };

  const updateHotel = async (id: string, updates: HotelUpdate) => {
    try {
      const { data, error } = await supabase
        .from("hotels")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      fetchHotels();
      return data;
    } catch (error) {
      logger.error('updateHotel', 'Error updating hotel', { error });
      throw error;
    }
  };

  const deleteHotel = async (id: string) => {
    try {
      const { error } = await supabase
        .from("hotels")
        .delete()
        .eq("id", id);

      if (error) throw error;

      fetchHotels();
    } catch (error) {
      logger.error('deleteHotel', 'Error deleting hotel', { error });
      throw error;
    }
  };

  // The shape callers already read, rebuilt from the query and preserved
  // exactly, so this lands without touching a page.
  return {
    hotels: data?.hotels ?? [],
    totalCount: data?.totalCount ?? 0,
    isLoading,
    error: error
      ? error instanceof Error
        ? error.message
        : "Failed to fetch hotels"
      : null,
    refetch: fetchHotels,
    createHotel,
    updateHotel,
    deleteHotel,
  };
}

// Hook to fetch a single hotel by slug
export function useHotel(slug: string | undefined) {
  // `enabled` replaces the `if (!slug) { setIsLoading(false); return; }` guard:
  // with no slug there is nothing to fetch, and the query never runs.
  const { data, isLoading, error } = useQuery<Hotel | null>({
    queryKey: queryKeys.hotels.detail(slug ?? ""),
    enabled: !!slug,
    staleTime: STALE_TIME.CONTENT_LIST,
    gcTime: GC_TIME,
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from("hotels")
        .select("*")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();

      if (fetchError) {
        logger.error('useHotel', 'Error fetching hotel', { error: fetchError });
        throw fetchError;
      }

      return (data ?? null) as Hotel | null;
    },
  });

  return {
    hotel: data ?? null,
    // Without a slug there is no request, so `isLoading` must read false rather
    // than the query's pending state -- callers render a spinner off it.
    isLoading: slug ? isLoading : false,
    error: error
      ? error instanceof Error
        ? error.message
        : "Failed to fetch hotel"
      : null,
  };
}

// Hook to fetch hotels linked to a specific event
export function useEventHotels(eventId: string | undefined) {
  type LinkedHotel = Hotel & { distance_miles?: number; notes?: string };

  const { data, isLoading } = useQuery<LinkedHotel[]>({
    queryKey: [...queryKeys.hotels.all, 'for-event', eventId ?? ""] as const,
    enabled: !!eventId,
    staleTime: STALE_TIME.CONTENT_LIST,
    gcTime: GC_TIME,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_hotels")
        .select("*, hotels(*)")
        .eq("event_id", eventId)
        .order("sort_order", { ascending: true });

      if (error) {
        logger.error('useEventHotels', 'Error fetching event hotels', { error });
        throw error;
      }

      return (data || [])
        .filter((eh: any) => eh.hotels && eh.hotels.is_active)
        .map((eh: any) => ({
          ...eh.hotels,
          distance_miles: eh.distance_miles,
          notes: eh.notes,
        })) as LinkedHotel[];
    },
  });

  return { hotels: data ?? [], isLoading: eventId ? isLoading : false };
}

// Hook to get filter options
export function useHotelFilterOptions() {
  // WEB-PERF-028 AC3. This ran TWO scans of the hotels table, one for `area`
  // and one for `hotel_type`, to build two dropdowns. They read the same rows
  // under the same predicate, so one projection of both columns answers both.
  const { data, isLoading } = useQuery<{ areas: string[]; hotelTypes: string[] }>({
    queryKey: [...queryKeys.hotels.all, 'filter-options'] as const,
    // Reference data: the set of areas and hotel types changes when a hotel is
    // added, not while someone is browsing.
    staleTime: STALE_TIME.REFERENCE,
    gcTime: GC_TIME,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotels")
        .select("area,hotel_type")
        .eq("is_active", true);

      if (error) {
        logger.error('useHotelFilterOptions', 'Error fetching hotel filter options', { error });
        throw error;
      }

      const rows = (data || []) as { area: string | null; hotel_type: string | null }[];
      return {
        areas: [...new Set(rows.map((h) => h.area).filter(Boolean))].sort() as string[],
        hotelTypes: [...new Set(rows.map((h) => h.hotel_type).filter(Boolean))].sort() as string[],
      };
    },
  });

  return {
    areas: data?.areas ?? [],
    hotelTypes: data?.hotelTypes ?? [],
    isLoading,
  };
}
