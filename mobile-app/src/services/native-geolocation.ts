/**
 * Native Geolocation Service
 *
 * Uses the native GPS/location APIs via Capacitor instead of the web
 * Geolocation API. This provides:
 * - Better accuracy and reliability
 * - Background location access (if needed)
 * - Proper permission dialogs per platform
 */

import { Geolocation, type Position, type PermissionStatus } from '@capacitor/geolocation';
import { isNative, isPluginAvailable } from '../config/platform';

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  timestamp: number;
}

/**
 * Check if location permissions have been granted.
 */
export async function checkLocationPermission(): Promise<PermissionStatus> {
  if (!isNative || !isPluginAvailable('Geolocation')) {
    return { location: 'denied', coarseLocation: 'denied' };
  }

  return Geolocation.checkPermissions();
}

/**
 * Request location permission from the user.
 */
export async function requestLocationPermission(): Promise<PermissionStatus> {
  if (!isNative || !isPluginAvailable('Geolocation')) {
    return { location: 'denied', coarseLocation: 'denied' };
  }

  return Geolocation.requestPermissions();
}

/**
 * Get the current device location.
 * Automatically requests permission if not yet granted.
 */
export async function getCurrentLocation(options?: {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}): Promise<LocationCoordinates | null> {
  if (!isNative || !isPluginAvailable('Geolocation')) {
    // Fall back to web Geolocation API
    return getCurrentLocationWeb(options);
  }

  try {
    const permission = await Geolocation.checkPermissions();
    if (permission.location === 'denied') {
      const requested = await Geolocation.requestPermissions();
      if (requested.location === 'denied') {
        return null;
      }
    }

    const position: Position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: options?.enableHighAccuracy ?? true,
      timeout: options?.timeout ?? 10000,
      maximumAge: options?.maximumAge ?? 30000,
    });

    return mapPosition(position);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to get native location:', error);
    }
    // Fall back to web API
    return getCurrentLocationWeb(options);
  }
}

/**
 * Watch the device location for continuous updates.
 * Returns a watch ID that can be used to clear the watch.
 */
export async function watchLocation(
  callback: (location: LocationCoordinates) => void,
  options?: {
    enableHighAccuracy?: boolean;
  }
): Promise<string | null> {
  if (!isNative || !isPluginAvailable('Geolocation')) return null;

  try {
    const watchId = await Geolocation.watchPosition(
      {
        enableHighAccuracy: options?.enableHighAccuracy ?? false,
      },
      (position, err) => {
        if (err) {
          if (import.meta.env.DEV) {
            console.warn('Location watch error:', err);
          }
          return;
        }
        if (position) {
          callback(mapPosition(position));
        }
      }
    );

    return watchId;
  } catch {
    return null;
  }
}

/**
 * Stop watching the device location.
 */
export async function clearLocationWatch(watchId: string): Promise<void> {
  if (!isNative || !isPluginAvailable('Geolocation')) return;

  try {
    await Geolocation.clearWatch({ id: watchId });
  } catch {
    // Silently ignore - watch may already be cleared
  }
}

/**
 * Calculate the distance between two coordinates in kilometers.
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// --- Internal helpers ---

function mapPosition(position: Position): LocationCoordinates {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    altitude: position.coords.altitude ?? undefined,
    speed: position.coords.speed ?? undefined,
    heading: position.coords.heading ?? undefined,
    timestamp: position.timestamp,
  };
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

function getCurrentLocationWeb(options?: {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}): Promise<LocationCoordinates | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude ?? undefined,
          speed: position.coords.speed ?? undefined,
          heading: position.coords.heading ?? undefined,
          timestamp: position.timestamp,
        });
      },
      () => resolve(null),
      {
        enableHighAccuracy: options?.enableHighAccuracy ?? true,
        timeout: options?.timeout ?? 10000,
        maximumAge: options?.maximumAge ?? 30000,
      }
    );
  });
}
