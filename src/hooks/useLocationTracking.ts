import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';

const log = createLogger('useLocationTracking');

export interface LocationPoint {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp: Date;
}

export interface LocationTrackingOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
  trackingInterval?: number; // How often to update position (ms)
  saveToDatabase?: boolean; // Save location history to database
  onLocationUpdate?: (location: LocationPoint) => void;
  onError?: (error: string) => void;
}

/**
 * Hook for real-time location tracking
 * Continuously monitors user's position with configurable accuracy and update frequency
 */
export function useLocationTracking(options: LocationTrackingOptions = {}) {
  const {
    enableHighAccuracy = true,
    timeout = 10000,
    maximumAge = 5000,
    trackingInterval = 10000,
    saveToDatabase = false,
    onLocationUpdate,
    onError,
  } = options;

  const [currentLocation, setCurrentLocation] = useState<LocationPoint | null>(null);
  const [locationHistory, setLocationHistory] = useState<LocationPoint[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const [distanceTraveled, setDistanceTraveled] = useState(0); // in meters
  const [averageSpeed, setAverageSpeed] = useState(0); // in m/s

  const watchIdRef = useRef<number | null>(null);
  const trackingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate distance between two points (Haversine formula)
  const calculateDistance = useCallback((
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number => {
    const R = 6371000; // Earth's radius in meters
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, []);

  // Save location to database
  const saveLocation = useCallback(async (location: LocationPoint) => {
    if (!saveToDatabase) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('location_history').insert({
        user_id: user.id,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        altitude: location.altitude,
        altitude_accuracy: location.altitudeAccuracy,
        heading: location.heading,
        speed: location.speed,
        timestamp: location.timestamp.toISOString(),
      });
    } catch (err) {
      log.error('Error saving location to database', { action: 'saveLocation', metadata: { error: err } });
    }
  }, [saveToDatabase]);

  // Handle location update
  const handleLocationUpdate = useCallback((position: GeolocationPosition) => {
    const newLocation: LocationPoint = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude,
      altitudeAccuracy: position.coords.altitudeAccuracy,
      heading: position.coords.heading,
      speed: position.coords.speed,
      timestamp: new Date(position.timestamp),
    };

    setCurrentLocation(newLocation);
    setLocationHistory(prev => {
      const updated = [...prev, newLocation];
      // Keep last 100 locations
      return updated.slice(-100);
    });

    // Calculate distance traveled
    if (currentLocation) {
      const distance = calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        newLocation.latitude,
        newLocation.longitude
      );
      setDistanceTraveled(prev => prev + distance);

      // Calculate average speed
      const timeDiff = (newLocation.timestamp.getTime() - currentLocation.timestamp.getTime()) / 1000; // seconds
      if (timeDiff > 0) {
        const speed = distance / timeDiff;
        setAverageSpeed(speed);
      }
    }

    onLocationUpdate?.(newLocation);
    saveLocation(newLocation);
    setError(null);
  }, [currentLocation, calculateDistance, onLocationUpdate, saveLocation]);

  // Handle error
  const handleError = useCallback((error: GeolocationPositionError) => {
    let errorMessage = 'Failed to get location';
    switch (error.code) {
      case error.PERMISSION_DENIED:
        errorMessage = 'Location permission denied';
        setPermissionStatus('denied');
        break;
      case error.POSITION_UNAVAILABLE:
        errorMessage = 'Location unavailable';
        break;
      case error.TIMEOUT:
        errorMessage = 'Location request timed out';
        break;
    }
    setError(errorMessage);
    onError?.(errorMessage);
  }, [onError]);

  // Start tracking
  const startTracking = useCallback(async () => {
    if (!navigator.geolocation) {
      const error = 'Geolocation is not supported by your browser';
      setError(error);
      onError?.(error);
      return false;
    }

    // Check permission status
    if ('permissions' in navigator) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        setPermissionStatus(result.state);
        
        result.addEventListener('change', () => {
          setPermissionStatus(result.state);
          if (result.state === 'denied') {
            stopTracking();
          }
        });
      } catch (err) {
        log.warn('Could not query geolocation permission', { action: 'startTracking' });
      }
    }

    setIsTracking(true);
    setError(null);

    // Start watching position
    watchIdRef.current = navigator.geolocation.watchPosition(
      handleLocationUpdate,
      handleError,
      {
        enableHighAccuracy,
        timeout,
        maximumAge,
      }
    );

    return true;
  }, [enableHighAccuracy, timeout, maximumAge, handleLocationUpdate, handleError, onError]);

  // Stop tracking
  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (trackingIntervalRef.current !== null) {
      clearInterval(trackingIntervalRef.current);
      trackingIntervalRef.current = null;
    }

    setIsTracking(false);
  }, []);

  // Get current position once (without continuous tracking)
  const getCurrentPosition = useCallback(async (): Promise<LocationPoint | null> => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported');
      return null;
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location: LocationPoint = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            altitudeAccuracy: position.coords.altitudeAccuracy,
            heading: position.coords.heading,
            speed: position.coords.speed,
            timestamp: new Date(position.timestamp),
          };
          resolve(location);
        },
        (error) => {
          handleError(error);
          reject(null);
        },
        {
          enableHighAccuracy,
          timeout,
          maximumAge,
        }
      );
    });
  }, [enableHighAccuracy, timeout, maximumAge, handleError]);

  // Clear location history
  const clearHistory = useCallback(() => {
    setLocationHistory([]);
    setDistanceTraveled(0);
    setAverageSpeed(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, [stopTracking]);

  return {
    currentLocation,
    locationHistory,
    isTracking,
    error,
    permissionStatus,
    distanceTraveled,
    averageSpeed,
    startTracking,
    stopTracking,
    getCurrentPosition,
    clearHistory,
  };
}

/**
 * Hook for retrieving location history from database
 */
export function useLocationHistory(userId?: string, limit = 100) {
  const [history, setHistory] = useState<LocationPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('location_history')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;

      if (error) throw error;

      setHistory((data || []).map(record => ({
        latitude: record.latitude,
        longitude: record.longitude,
        accuracy: record.accuracy,
        altitude: record.altitude,
        altitudeAccuracy: record.altitude_accuracy,
        heading: record.heading,
        speed: record.speed,
        timestamp: new Date(record.timestamp),
      })));
    } catch (err) {
      log.error('Error fetching location history', { action: 'fetchHistory', metadata: { error: err } });
      setError(err instanceof Error ? err.message : 'Failed to fetch history');
    } finally {
      setIsLoading(false);
    }
  }, [userId, limit]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return {
    history,
    isLoading,
    error,
    refetch: fetchHistory,
  };
}

// Helper function
function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Format speed for display
 */
export function formatSpeed(metersPerSecond: number): string {
  const mph = metersPerSecond * 2.23694;
  return `${mph.toFixed(1)} mph`;
}

/**
 * Format distance for display
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${meters.toFixed(0)} m`;
  }
  const miles = meters * 0.000621371;
  return `${miles.toFixed(2)} mi`;
}
