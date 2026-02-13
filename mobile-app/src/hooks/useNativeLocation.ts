/**
 * React hook for native geolocation.
 *
 * Uses the Capacitor Geolocation plugin for better accuracy and
 * reliability compared to the web Geolocation API.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  getCurrentLocation,
  watchLocation,
  clearLocationWatch,
  type LocationCoordinates,
} from '../services/native-geolocation';

export interface UseNativeLocationReturn {
  location: LocationCoordinates | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Get the device's current location using native APIs.
 *
 * @param autoFetch - Whether to fetch location immediately on mount (default: false)
 *
 * @example
 * ```tsx
 * function NearbyEvents() {
 *   const { location, isLoading, refresh } = useNativeLocation(true);
 *
 *   if (isLoading) return <Spinner />;
 *   if (!location) return <LocationPermissionPrompt onAllow={refresh} />;
 *
 *   return <EventList lat={location.latitude} lng={location.longitude} />;
 * }
 * ```
 */
export function useNativeLocation(autoFetch: boolean = false): UseNativeLocationReturn {
  const [location, setLocation] = useState<LocationCoordinates | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const coords = await getCurrentLocation({ enableHighAccuracy: true });
      if (coords) {
        setLocation(coords);
      } else {
        setError('Location permission denied or unavailable');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get location');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoFetch) {
      refresh();
    }
  }, [autoFetch, refresh]);

  return { location, isLoading, error, refresh };
}

/**
 * Watch the device's location for continuous updates.
 *
 * @example
 * ```tsx
 * function LiveMap() {
 *   const { location } = useLocationWatch();
 *
 *   return <Map center={location ? [location.latitude, location.longitude] : defaultCenter} />;
 * }
 * ```
 */
export function useLocationWatch(): UseNativeLocationReturn {
  const [location, setLocation] = useState<LocationCoordinates | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const coords = await getCurrentLocation({ enableHighAccuracy: true });
    if (coords) setLocation(coords);
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const id = await watchLocation((coords) => {
          if (mounted) {
            setLocation(coords);
            setIsLoading(false);
          }
        });
        watchIdRef.current = id;
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Location watch failed');
          setIsLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
      if (watchIdRef.current) {
        clearLocationWatch(watchIdRef.current);
      }
    };
  }, []);

  return { location, isLoading, error, refresh };
}
