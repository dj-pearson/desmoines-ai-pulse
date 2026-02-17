import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

type Hotel = Database["public"]["Tables"]["hotels"]["Row"];
type HotelInsert = Database["public"]["Tables"]["hotels"]["Insert"];
type HotelUpdate = Database["public"]["Tables"]["hotels"]["Update"];

interface HotelsState {
  hotels: Hotel[];
  isLoading: boolean;
  error: string | null;
  totalCount: number;
}

interface HotelFilters {
  search?: string;
  area?: string[];
  priceRange?: string[];
  hotelType?: string[];
  amenities?: string[];
  starRating?: number;
  sortBy?: "featured" | "price_low" | "price_high" | "rating" | "alphabetical" | "newest";
  featuredOnly?: boolean;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
}

export function useHotels(filters: HotelFilters = {}) {
  const [state, setState] = useState<HotelsState>({
    hotels: [],
    isLoading: true,
    error: null,
    totalCount: 0,
  });

  const fetchHotels = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      let query = supabase.from("hotels").select("*", { count: "exact" });

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

      setState({
        hotels: data || [],
        isLoading: false,
        error: null,
        totalCount: count || 0,
      });
    } catch (error) {
      console.error("Error fetching hotels:", error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch hotels",
      }));
    }
  }, [
    filters.search,
    filters.area,
    filters.priceRange,
    filters.hotelType,
    filters.amenities,
    filters.starRating,
    filters.sortBy,
    filters.featuredOnly,
    filters.activeOnly,
    filters.limit,
    filters.offset,
  ]);

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
      console.error("Error creating hotel:", error);
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
      console.error("Error updating hotel:", error);
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
      console.error("Error deleting hotel:", error);
      throw error;
    }
  };

  useEffect(() => {
    fetchHotels();
  }, [fetchHotels]);

  return {
    ...state,
    refetch: fetchHotels,
    createHotel,
    updateHotel,
    deleteHotel,
  };
}

// Hook to fetch a single hotel by slug
export function useHotel(slug: string | undefined) {
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setIsLoading(false);
      return;
    }

    const fetchHotel = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from("hotels")
          .select("*")
          .eq("slug", slug)
          .eq("is_active", true)
          .maybeSingle();

        if (fetchError) throw fetchError;

        setHotel(data);
      } catch (err) {
        console.error("Error fetching hotel:", err);
        setError(
          err instanceof Error ? err.message : "Failed to fetch hotel"
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchHotel();
  }, [slug]);

  return { hotel, isLoading, error };
}

// Hook to fetch hotels linked to a specific event
export function useEventHotels(eventId: string | undefined) {
  const [hotels, setHotels] = useState<(Hotel & { distance_miles?: number; notes?: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!eventId) {
      setIsLoading(false);
      return;
    }

    const fetchEventHotels = async () => {
      try {
        setIsLoading(true);

        const { data, error } = await supabase
          .from("event_hotels")
          .select("*, hotels(*)")
          .eq("event_id", eventId)
          .order("sort_order", { ascending: true });

        if (error) throw error;

        const linked = (data || [])
          .filter((eh: any) => eh.hotels && eh.hotels.is_active)
          .map((eh: any) => ({
            ...eh.hotels,
            distance_miles: eh.distance_miles,
            notes: eh.notes,
          }));

        setHotels(linked);
      } catch (err) {
        console.error("Error fetching event hotels:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEventHotels();
  }, [eventId]);

  return { hotels, isLoading };
}

// Hook to get filter options
export function useHotelFilterOptions() {
  const [options, setOptions] = useState({
    areas: [] as string[],
    hotelTypes: [] as string[],
    isLoading: true,
  });

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const { data: areaData } = await supabase
          .from("hotels")
          .select("area")
          .eq("is_active", true)
          .not("area", "is", null);

        const { data: typeData } = await supabase
          .from("hotels")
          .select("hotel_type")
          .eq("is_active", true)
          .not("hotel_type", "is", null);

        const uniqueAreas = [
          ...new Set(areaData?.map((h) => h.area).filter(Boolean)),
        ] as string[];

        const uniqueTypes = [
          ...new Set(typeData?.map((h) => h.hotel_type).filter(Boolean)),
        ] as string[];

        setOptions({
          areas: uniqueAreas.sort(),
          hotelTypes: uniqueTypes.sort(),
          isLoading: false,
        });
      } catch (error) {
        console.error("Error fetching hotel filter options:", error);
        setOptions((prev) => ({ ...prev, isLoading: false }));
      }
    };

    fetchOptions();
  }, []);

  return options;
}
