import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface KnownVenue {
  id: string;
  name: string;
  aliases: string[];
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  venue_type: string | null;
  capacity: number | null;
  description: string | null;
  seo_keywords: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VenueFormData {
  name: string;
  aliases?: string[];
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  email?: string;
  website?: string;
  venue_type?: string;
  capacity?: number;
  description?: string;
  seo_keywords?: string[];
  is_active?: boolean;
}

export interface VenueMatch {
  venue_id: string;
  venue_name: string;
  venue_address: string | null;
  venue_city: string | null;
  venue_state: string | null;
  venue_zip: string | null;
  venue_latitude: number | null;
  venue_longitude: number | null;
  venue_phone: string | null;
  venue_email: string | null;
  venue_website: string | null;
  full_location: string | null;
}

// Fetch all venues
export function useKnownVenues(includeInactive = false) {
  return useQuery({
    queryKey: ["known-venues", includeInactive],
    queryFn: async () => {
      let query = supabase
        .from("known_venues")
        .select("*")
        .order("name");

      if (!includeInactive) {
        query = query.eq("is_active", true);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as KnownVenue[];
    },
  });
}

// Fetch a single venue
export function useKnownVenue(id: string | null) {
  return useQuery({
    queryKey: ["known-venue", id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from("known_venues")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as KnownVenue;
    },
    enabled: !!id,
  });
}

// Create venue mutation
export function useCreateVenue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (venue: VenueFormData) => {
      const { data, error } = await supabase
        .from("known_venues")
        .insert({
          ...venue,
          aliases: venue.aliases || [],
        })
        .select()
        .single();

      if (error) throw error;
      return data as KnownVenue;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["known-venues"] });
      toast.success("Venue created successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to create venue: " + error.message);
    },
  });
}

// Update venue mutation
export function useUpdateVenue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...venue }: VenueFormData & { id: string }) => {
      const { data, error } = await supabase
        .from("known_venues")
        .update(venue)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as KnownVenue;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["known-venues"] });
      queryClient.invalidateQueries({ queryKey: ["known-venue", data.id] });
      toast.success("Venue updated successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to update venue: " + error.message);
    },
  });
}

// Delete venue mutation
export function useDeleteVenue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("known_venues")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["known-venues"] });
      toast.success("Venue deleted successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to delete venue: " + error.message);
    },
  });
}

// Find matching venue by text (uses database function)
export function useFindMatchingVenue() {
  return useMutation({
    mutationFn: async (venueText: string): Promise<VenueMatch | null> => {
      // First, try to find a matching venue using the database function
      const { data: venueId, error: matchError } = await supabase
        .rpc("find_matching_venue", { venue_text: venueText });

      if (matchError) {
        console.error("Error finding venue:", matchError);
        return null;
      }

      if (!venueId) {
        return null;
      }

      // Get the venue details
      const { data: details, error: detailsError } = await supabase
        .rpc("get_venue_details", { venue_id: venueId });

      if (detailsError || !details || details.length === 0) {
        console.error("Error getting venue details:", detailsError);
        return null;
      }

      const venue = details[0];
      return {
        venue_id: venueId,
        venue_name: venue.venue_name,
        venue_address: venue.venue_address,
        venue_city: venue.venue_city,
        venue_state: venue.venue_state,
        venue_zip: venue.venue_zip,
        venue_latitude: venue.venue_latitude,
        venue_longitude: venue.venue_longitude,
        venue_phone: venue.venue_phone,
        venue_email: venue.venue_email,
        venue_website: venue.venue_website,
        full_location: venue.full_location,
      };
    },
  });
}

// Client-side venue matching (faster, uses cached data)
export function useVenueMatcher() {
  const { data: venues } = useKnownVenues();

  const findVenue = useCallback((venueText: string): KnownVenue | null => {
    if (!venues || !venueText) return null;

    const searchText = venueText.toLowerCase().trim();

    // First try exact match on name
    let match = venues.find(
      (v) => v.name.toLowerCase() === searchText
    );
    if (match) return match;

    // Then try alias match
    match = venues.find((v) =>
      v.aliases?.some((alias) => alias.toLowerCase() === searchText)
    );
    if (match) return match;

    // Try partial match on name
    match = venues.find(
      (v) =>
        v.name.toLowerCase().includes(searchText) ||
        searchText.includes(v.name.toLowerCase())
    );
    if (match) return match;

    // Try partial match on aliases
    match = venues.find((v) =>
      v.aliases?.some(
        (alias) =>
          alias.toLowerCase().includes(searchText) ||
          searchText.includes(alias.toLowerCase())
      )
    );

    return match || null;
  }, [venues]);

  const getAutoFillData = useCallback((venue: KnownVenue) => {
    const fullLocation = venue.address
      ? `${venue.address}, ${venue.city || ""}, ${venue.state || ""} ${venue.zip || ""}`.trim()
      : `${venue.city || ""}, ${venue.state || ""}`.trim();

    return {
      venue: venue.name,
      location: fullLocation,
      latitude: venue.latitude,
      longitude: venue.longitude,
      // Additional fields that might be useful
      venue_phone: venue.phone,
      venue_email: venue.email,
      venue_website: venue.website,
    };
  }, []);

  return {
    venues,
    findVenue,
    getAutoFillData,
    isReady: !!venues,
  };
}

// Get venue statistics
export function useVenueStats() {
  const { data: venues } = useKnownVenues(true);

  if (!venues) {
    return {
      total: 0,
      active: 0,
      inactive: 0,
      withCoordinates: 0,
      byType: {} as Record<string, number>,
    };
  }

  const active = venues.filter((v) => v.is_active).length;
  const withCoordinates = venues.filter(
    (v) => v.latitude && v.longitude
  ).length;

  const byType = venues.reduce((acc, v) => {
    const type = v.venue_type || "uncategorized";
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    total: venues.length,
    active,
    inactive: venues.length - active,
    withCoordinates,
    byType,
  };
}
