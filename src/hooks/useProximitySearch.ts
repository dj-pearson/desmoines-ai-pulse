import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('useProximitySearch');

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

/**
 * Hook for searching events by proximity to a location
 * Uses PostGIS geospatial functions for accurate distance calculations
 */
export function useEventsNearby(options: ProximitySearchOptions) {
  const [state, setState] = useState<ProximitySearchResult<EventWithDistance>>({
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

      const radiusMeters = (options.radiusMiles || 25) * 1609.34; // Convert miles to meters

      // Use the RPC function for geospatial search
      const { data, error } = await supabase.rpc('search_events_near_location', {
        user_lat: options.latitude,
        user_lon: options.longitude,
        radius_meters: Math.round(radiusMeters),
        search_limit: options.limit || 50,
      });

      if (error) throw error;

      let results = (data || []) as EventWithDistance[];

      // Apply category filter if specified
      if (options.category && options.category !== 'all') {
        results = results.filter(event => event.category === options.category);
      }

      // Add distance in miles for display
      results = results.map(event => ({
        ...event,
        distance_miles: event.distance_meters
          ? Number((event.distance_meters * 0.000621371).toFixed(1))
          : undefined,
      }));

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
      log.error('Error searching nearby events', { action: 'searchEventsNearby', metadata: { error } });
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to search nearby events',
      }));
    }
  }, [options.latitude, options.longitude, options.radiusMiles, options.limit, options.category, options.sortBy]);

  useEffect(() => {
    search();
  }, [search]);

  return {
    ...state,
    refetch: search,
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
      log.error('Error searching nearby restaurants', { action: 'searchRestaurantsNearby', metadata: { error } });
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
        enableHighAccuracy: true,
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
      sorted.sort((a, b) => (a.distance_miles || Infinity) - (b.distance_miles || Infinity));
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
  if (!distanceMiles) return '';
  if (distanceMiles < 0.1) return 'Nearby';
  if (distanceMiles < 1) return `${(distanceMiles * 5280).toFixed(0)} ft`;
  return `${distanceMiles.toFixed(1)} mi away`;
}
