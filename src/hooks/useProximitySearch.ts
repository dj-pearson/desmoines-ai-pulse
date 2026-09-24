import { useState, useEffect, useCallback } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';
import { filterVisibleIds } from '@/lib/eventQuery';
import { handleError } from '@/lib/errorHandler';
import { eventStartsInWindow, roundCoordinate } from '@/lib/nearMeOrigins';

type Event = Database['public']['Tables']['events']['Row'];
type Restaurant = Database['public']['Tables']['restaurants']['Row'];
type Attraction = Database['public']['Tables']['attractions']['Row'];

// Extend types with distance information
export interface EventWithDistance extends Event {
  distance_miles?: number;
  distance_meters?: number;
}

export interface RestaurantWithDistance extends Restaurant {
  distance_miles?: number;
}

export interface AttractionWithDistance extends Attraction {
  distance_miles?: number;
}

export interface ProximitySearchOptions {
  latitude: number;
  longitude: number;
  radiusMiles?: number;
  limit?: number;
  category?: string;
  sortBy?: 'distance' | 'date' | 'popularity' | 'rating';
}

export interface ProximitySearchResult<T> {
  items: T[];
  isLoading: boolean;
  error: string | null;
  totalCount: number;
  searchCenter: { latitude: number; longitude: number } | null;
}

export interface EventsNearbyOptions {
  latitude: number;
  longitude: number;
  radiusMiles?: number;
  /** Canonical category (EVENT_CATEGORIES), or undefined/'all' for any. */
  category?: string;
  /** Central-time bounds from nearMeWindowBounds(); null means any date. */
  window?: { start: string; end: string } | null;
  enabled?: boolean;
}

/**
 * Rows the RPC may return. Enough headroom that the category and time-window
 * filters applied after LIMIT are not starved by the RPC's featured-first
 * ordering (docs/page-plans/events.md WP6 item 3).
 */
export const NEARBY_EVENTS_LIMIT = 200;

const METERS_PER_MILE = 1609.34;

/**
 * Events within a radius, via the PostGIS RPC, on TanStack Query.
 *
 * The query key carries the coordinates ROUNDED to 2 decimals, and the RPC
 * receives the same rounded pair, so the visitor's precise position is never
 * sent or cached. Category and window are applied client-side (the v1 RPC takes
 * neither; D1's v2 will), and every id is passed through filterVisibleIds
 * because v1 returns merged, hidden and archived rows (D1).
 *
 * `limitHit` is true when the RPC returned its full LIMIT, so the page can say
 * the list is the nearest N rather than all of them.
 */
export function useEventsNearby(options: EventsNearbyOptions) {
  const latitude = roundCoordinate(options.latitude);
  const longitude = roundCoordinate(options.longitude);
  const radiusMiles = options.radiusMiles ?? 25;
  const category = options.category && options.category !== "all" ? options.category : null;
  const timeWindow = options.window ?? null;

  const query = useQuery({
    queryKey: [
      "events-nearby",
      latitude,
      longitude,
      radiusMiles,
      category,
      timeWindow?.start ?? null,
      timeWindow?.end ?? null,
    ],
    enabled: options.enabled !== false && Number.isFinite(latitude) && Number.isFinite(longitude),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_events_near_location", {
        user_lat: latitude,
        user_lon: longitude,
        radius_meters: Math.round(radiusMiles * METERS_PER_MILE),
        search_limit: NEARBY_EVENTS_LIMIT,
      });
      if (error) throw error;

      const raw = (data ?? []) as EventWithDistance[];
      // Interim until D1: the RPC applies no visibility predicates.
      const visible = raw.length > 0 ? await filterVisibleIds(raw.map((e) => e.id)) : new Set<string>();

      const items = raw
        .filter((event) => visible.has(event.id))
        .filter((event) => !category || event.category === category)
        .filter((event) => eventStartsInWindow(event, timeWindow))
        .map((event) => ({
          ...event,
          distance_miles:
            event.distance_meters != null
              ? Number((event.distance_meters / METERS_PER_MILE).toFixed(1))
              : undefined,
        }));

      return {
        items: sortResults(items, "distance"),
        limitHit: raw.length >= NEARBY_EVENTS_LIMIT,
      };
    },
  });

  return {
    items: query.data?.items ?? [],
    limitHit: query.data?.limitHit ?? false,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetched: query.isFetched,
    error: query.error,
    refetch: query.refetch,
    searchCenter: { latitude, longitude },
  };
}

/**
 * Hook for searching restaurants by proximity to a location
 */
export function useRestaurantsNearby(options: ProximitySearchOptions) {
  const [state, setState] = useState<ProximitySearchResult<RestaurantWithDistance>>({
    items: [],
    isLoading: false,
    error: null,
    totalCount: 0,
    searchCenter: null,
  });

  const search = useCallback(async () => {
    if (!options.latitude || !options.longitude) {
      setState(prev => ({
        ...prev,
        error: 'Latitude and longitude are required',
        isLoading: false,
      }));
      return;
    }

    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const { data, error } = await supabase.rpc('restaurants_within_radius', {
        center_lat: options.latitude,
        center_lng: options.longitude,
        radius_miles: options.radiusMiles || 25,
        limit_count: options.limit || 100,
      });

      if (error) throw error;

      let results = (data || []) as RestaurantWithDistance[];

      // Apply sorting
      if (options.sortBy) {
        results = sortResults(results, options.sortBy);
      }

      setState({
        items: results,
        isLoading: false,
        error: null,
        totalCount: results.length,
        searchCenter: { latitude: options.latitude, longitude: options.longitude },
      });
    } catch (error) {
      handleError(error, { component: 'useRestaurantsNearby', action: 'search' });
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to search nearby restaurants',
      }));
    }
  }, [options.latitude, options.longitude, options.radiusMiles, options.limit, options.sortBy]);

  useEffect(() => {
    search();
  }, [search]);

  return {
    ...state,
    refetch: search,
  };
}

/**
 * Hook for getting user's current location
 * Uses browser Geolocation API with error handling
 */
export function useGeolocation() {
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    setIsLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setIsLoading(false);
      },
      (error) => {
        let errorMessage = 'Failed to get your location';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location permission denied. Please enable location access.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information unavailable.';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out.';
            break;
        }
        setError(errorMessage);
        setIsLoading(false);
      },
      {
        // A city-scale radius search needs no GPS fix; the coarse position is
        // faster, cheaper on battery and reveals less (events plan WP6 item 7).
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000, // Cache location for 5 minutes
      }
    );
  }, []);

  return {
    location,
    error,
    isLoading,
    requestLocation,
  };
}

/**
 * Utility function to sort results by different criteria
 */
function sortResults<T extends { distance_miles?: number; date?: string; rating?: number }>(
  results: T[],
  sortBy: string
): T[] {
  const sorted = [...results];

  switch (sortBy) {
    case 'distance':
      sorted.sort((a, b) => (a.distance_miles ?? Infinity) - (b.distance_miles ?? Infinity));
      break;
    case 'date':
      sorted.sort((a, b) => {
        if (!a.date || !b.date) return 0;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });
      break;
    case 'rating':
      sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      break;
    case 'popularity':
      // Already sorted by popularity in the database query
      break;
  }

  return sorted;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in miles
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return Number(distance.toFixed(1));
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Format distance for display
 */
export function formatDistance(miles: number): string {
  if (miles < 0.1) return 'Less than 0.1 mi';
  if (miles < 1) return `${miles.toFixed(1)} mi`;
  return `${miles.toFixed(1)} mi`;
}

/**
 * Get distance display text with appropriate units
 */
export function getDistanceDisplay(distanceMiles?: number): string {
  if (distanceMiles == null || !Number.isFinite(distanceMiles)) return '';
  if (distanceMiles < 0.1) return 'Nearby';
  if (distanceMiles < 1) return `${(distanceMiles * 5280).toFixed(0)} ft`;
  return `${distanceMiles.toFixed(1)} mi away`;
}
