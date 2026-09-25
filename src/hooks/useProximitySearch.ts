import { useState, useEffect, useCallback } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';
import { fetchVisibleEventsByIds } from '@/lib/eventQuery';
import { handleError } from '@/lib/errorHandler';
import { nearMeBox, roundCoordinate } from '@/lib/nearMeOrigins';
import { EVENT_LIST_COLUMNS } from '@/lib/listColumns';
import type { CentralWindow } from '@/lib/timezone';
import { applyHubFilters, isNotOver, type HubEvent } from '@/components/events/eventsHubQuery';

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
  window?: CentralWindow | null;
  enabled?: boolean;
}

/** A near-me row: the list projection plus its distance from the origin. */
export type NearbyEvent = HubEvent & {
  distance_miles: number;
  distance_meters: number;
};

export interface NearbyEventsResult {
  items: NearbyEvent[];
  /** The source stopped at its cap, so there may be more than `items`. */
  limitHit: boolean;
  /** Which query answered: the windowed table read, or the Anytime RPC. */
  source: "window" | "rpc";
}

/**
 * Rows the RPC may return ("Anytime" only). The v1 RPC orders featured rows
 * first and applies its LIMIT before anything else, so a full answer is not
 * the nearest 200; the page says so (events-pass2 WP5 item 2).
 */
export const NEARBY_EVENTS_LIMIT = 200;

/**
 * Rows the windowed read may return. A 50-mile box over a week is a few
 * hundred rows on a busy week; at the cap the page says the list may be
 * incomplete rather than presenting it as all of them.
 */
export const NEARBY_WINDOW_CAP = 1000;

const METERS_PER_MILE = 1609.34;

type Center = { latitude: number; longitude: number };

function withDistance(event: HubEvent, center: Center): NearbyEvent | null {
  if (typeof event.latitude !== "number" || typeof event.longitude !== "number") return null;
  const miles = calculateDistance(center.latitude, center.longitude, event.latitude, event.longitude);
  return { ...event, distance_miles: miles, distance_meters: Math.round(miles * METERS_PER_MILE) };
}

function startMs(event: HubEvent): number {
  const raw = event.event_start_utc || event.date;
  const t = raw instanceof Date ? raw.getTime() : Date.parse(String(raw ?? ""));
  return Number.isNaN(t) ? Infinity : t;
}

function byDistanceThenStart(a: NearbyEvent, b: NearbyEvent): number {
  if (a.distance_miles !== b.distance_miles) return a.distance_miles - b.distance_miles;
  return startMs(a) - startMs(b);
}

/**
 * A window is set: read `events` directly (events-pass2 WP5 item 1). The
 * hub's own predicates (visibility, the Central window with running
 * festivals, the not-over rule when the window holds now, category) plus a
 * lat/lng box around the rounded origin, THEN the cap, so a busy later date
 * can never push a nearer in-window row out of the answer the way the RPC's
 * LIMIT did. The box's corners are dropped by haversine distance here.
 */
export async function fetchNearbyInWindow(
  center: Center,
  radiusMiles: number,
  category: string | null,
  window: CentralWindow,
  now: Date = new Date()
): Promise<NearbyEventsResult> {
  const box = nearMeBox(center, radiusMiles);
  const { data, error } = await applyHubFilters(
    supabase.from("events").select(EVENT_LIST_COLUMNS),
    { search: "", category: category ?? "all", window, area: undefined, freeOnly: false, sort: "date_asc" },
    now
  )
    .not("latitude", "is", null)
    .gte("latitude", box.south)
    .lte("latitude", box.north)
    .gte("longitude", box.west)
    .lte("longitude", box.east)
    .order("date", { ascending: true })
    .order("id", { ascending: true })
    .limit(NEARBY_WINDOW_CAP);
  if (error) throw error;

  const rows = (data ?? []) as unknown as HubEvent[];
  const items = rows
    .map((row) => withDistance(row, center))
    .filter((row): row is NearbyEvent => row !== null && row.distance_miles <= radiusMiles)
    .sort(byDistanceThenStart);
  return { items, limitHit: rows.length >= NEARBY_WINDOW_CAP, source: "window" };
}

interface NearbyRpcRow {
  id: string;
  distance_meters: number | null;
}

/**
 * "Anytime": the PostGIS RPC for ids and distances, then one read of the list
 * projection under the visibility rules (the v1 RPC applies none, D1), the
 * hub's not-over rule, and the category. Interim until D1's v2.
 */
export async function fetchNearbyAnytime(
  center: Center,
  radiusMiles: number,
  category: string | null,
  now: Date = new Date()
): Promise<NearbyEventsResult> {
  const { data, error } = await supabase.rpc("search_events_near_location", {
    user_lat: center.latitude,
    user_lon: center.longitude,
    radius_meters: Math.round(radiusMiles * METERS_PER_MILE),
    search_limit: NEARBY_EVENTS_LIMIT,
  });
  if (error) throw error;

  const raw = (data ?? []) as unknown as NearbyRpcRow[];
  const distance = new Map<string, number>();
  for (const row of raw) {
    if (row?.id && row.distance_meters != null) distance.set(row.id, row.distance_meters);
  }
  const rows =
    distance.size > 0
      ? await fetchVisibleEventsByIds<HubEvent>([...distance.keys()], EVENT_LIST_COLUMNS)
      : [];

  const items = rows
    .filter((event) => isNotOver(event, now))
    .filter((event) => !category || event.category === category)
    .map((event): NearbyEvent => {
      const meters = distance.get(event.id) ?? 0;
      return {
        ...event,
        distance_meters: meters,
        distance_miles: Number((meters / METERS_PER_MILE).toFixed(1)),
      };
    })
    .sort(byDistanceThenStart);
  return { items, limitHit: raw.length >= NEARBY_EVENTS_LIMIT, source: "rpc" };
}

/**
 * Events within a radius, on TanStack Query.
 *
 * The query key carries the coordinates ROUNDED to 2 decimals, and the
 * queries receive the same rounded pair, so the visitor's precise position is
 * never sent or cached. With a window the answer is exact (fetchNearbyInWindow);
 * "Anytime" goes through the RPC and says when it hit its cap.
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
    queryFn: () =>
      timeWindow
        ? fetchNearbyInWindow({ latitude, longitude }, radiusMiles, category, timeWindow)
        : fetchNearbyAnytime({ latitude, longitude }, radiusMiles, category),
  });

  return {
    items: query.data?.items ?? [],
    limitHit: query.data?.limitHit ?? false,
    source: query.data?.source ?? (timeWindow ? "window" : "rpc"),
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetched: query.isFetched,
    isSuccess: query.isSuccess,
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
