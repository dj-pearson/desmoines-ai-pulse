import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface GeofenceRegion {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  description?: string;
  active?: boolean;
}

export interface GeofenceEvent {
  type: 'enter' | 'exit' | 'dwell';
  region: GeofenceRegion;
  timestamp: Date;
  userLocation: {
    latitude: number;
    longitude: number;
  };
}

export type GeofenceCallback = (event: GeofenceEvent) => void;

interface GeofenceOptions {
  regions: GeofenceRegion[];
  onEnter?: GeofenceCallback;
  onExit?: GeofenceCallback;
  onDwell?: GeofenceCallback;
  dwellTimeMs?: number; // Time in region before triggering dwell event
  trackingInterval?: number; // How often to check position (ms)
  enableNotifications?: boolean;
}

/**
 * Hook for geofencing functionality
 * Monitors user location and triggers events when entering/exiting defined regions
 */
export function useGeofencing(options: GeofenceOptions) {
  const {
    regions,
    onEnter,
    onExit,
    onDwell,
    dwellTimeMs = 300000, // 5 minutes default
    trackingInterval = 10000, // 10 seconds default
    enableNotifications = false,
  } = options;

  const [currentLocation, setCurrentLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [activeRegions, setActiveRegions] = useState<Set<string>>(new Set());
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'prompt'>('prompt');

  const watchIdRef = useRef<number | null>(null);
  const dwellTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const lastLocationsRef = useRef<Map<string, Date>>(new Map());

  // Check if point is inside region
  const isPointInRegion = useCallback((
    lat: number,
    lon: number,
    region: GeofenceRegion
  ): boolean => {
    const R = 6371000; // Earth's radius in meters
    const dLat = toRad(region.latitude - lat);
    const dLon = toRad(region.longitude - lon);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat)) * Math.cos(toRad(region.latitude)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance <= region.radiusMeters;
  }, []);

  // Request notification permission
  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      console.warn('Notifications not supported');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }, []);

  // Show notification
  const showNotification = useCallback((event: GeofenceEvent) => {
    if (!enableNotifications || Notification.permission !== 'granted') {
      return;
    }

    let title = '';
    let body = '';

    switch (event.type) {
      case 'enter':
        title = `Entered ${event.region.name}`;
        body = event.region.description || 'You are now in this area';
        break;
      case 'exit':
        title = `Left ${event.region.name}`;
        body = 'You have exited this area';
        break;
      case 'dwell':
        title = `Still at ${event.region.name}`;
        body = 'You have been in this area for a while';
        break;
    }

    new Notification(title, {
      body,
      icon: '/icon-192.png',
      tag: `geofence-${event.region.id}-${event.type}`,
    });
  }, [enableNotifications]);

  // Handle location update
  const handleLocationUpdate = useCallback((position: GeolocationPosition) => {
    const { latitude, longitude } = position.coords;
    setCurrentLocation({ latitude, longitude });

    const newActiveRegions = new Set<string>();

    regions.forEach(region => {
      if (!region.active) return;

      const isInside = isPointInRegion(latitude, longitude, region);
      const wasInside = activeRegions.has(region.id);

      if (isInside) {
        newActiveRegions.add(region.id);

        if (!wasInside) {
          // Entered region
          const event: GeofenceEvent = {
            type: 'enter',
            region,
            timestamp: new Date(),
            userLocation: { latitude, longitude },
          };
          onEnter?.(event);
          showNotification(event);

          // Start dwell timer
          const dwellTimer = setTimeout(() => {
            const dwellEvent: GeofenceEvent = {
              type: 'dwell',
              region,
              timestamp: new Date(),
              userLocation: { latitude, longitude },
            };
            onDwell?.(dwellEvent);
            showNotification(dwellEvent);
          }, dwellTimeMs);

          dwellTimersRef.current.set(region.id, dwellTimer);
          lastLocationsRef.current.set(region.id, new Date());
        }
      } else if (wasInside) {
        // Exited region
        const event: GeofenceEvent = {
          type: 'exit',
          region,
          timestamp: new Date(),
          userLocation: { latitude, longitude },
        };
        onExit?.(event);
        showNotification(event);

        // Clear dwell timer
        const dwellTimer = dwellTimersRef.current.get(region.id);
        if (dwellTimer) {
          clearTimeout(dwellTimer);
          dwellTimersRef.current.delete(region.id);
        }
        lastLocationsRef.current.delete(region.id);
      }
    });

    setActiveRegions(newActiveRegions);
  }, [regions, activeRegions, isPointInRegion, onEnter, onExit, onDwell, dwellTimeMs, showNotification]);

  // Start tracking
  const startTracking = useCallback(async () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported');
      return false;
    }

    // Request notification permission if enabled
    if (enableNotifications) {
      await requestNotificationPermission();
    }

    // Check permission status
    if ('permissions' in navigator) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        setPermissionStatus(result.state);
        
        result.addEventListener('change', () => {
          setPermissionStatus(result.state);
        });
      } catch (err) {
        console.warn('Could not query geolocation permission');
      }
    }

    setIsTracking(true);
    setError(null);

    // Start watching position
    watchIdRef.current = navigator.geolocation.watchPosition(
      handleLocationUpdate,
      (error) => {
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
        setIsTracking(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: trackingInterval,
      }
    );

    return true;
  }, [handleLocationUpdate, trackingInterval, enableNotifications, requestNotificationPermission]);

  // Stop tracking
  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    // Clear all dwell timers
    dwellTimersRef.current.forEach(timer => clearTimeout(timer));
    dwellTimersRef.current.clear();
    lastLocationsRef.current.clear();

    setIsTracking(false);
    setActiveRegions(new Set());
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, [stopTracking]);

  return {
    currentLocation,
    activeRegions: Array.from(activeRegions),
    isTracking,
    error,
    permissionStatus,
    startTracking,
    stopTracking,
  };
}

/**
 * Hook for creating and managing geofence regions in the database
 */
export function useGeofenceRegions() {
  const [regions, setRegions] = useState<GeofenceRegion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRegions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('geofence_regions')
        .select('*')
        .eq('active', true)
        .order('name');

      if (error) throw error;

      setRegions((data || []).map(region => ({
        id: region.id,
        name: region.name,
        latitude: region.latitude,
        longitude: region.longitude,
        radiusMeters: region.radius_meters,
        description: region.description,
        active: region.active,
      })));
    } catch (err) {
      console.error('Error fetching geofence regions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch regions');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createRegion = useCallback(async (region: Omit<GeofenceRegion, 'id'>) => {
    try {
      const { data, error } = await supabase
        .from('geofence_regions')
        .insert({
          name: region.name,
          latitude: region.latitude,
          longitude: region.longitude,
          radius_meters: region.radiusMeters,
          description: region.description,
          active: region.active ?? true,
        })
        .select()
        .single();

      if (error) throw error;

      await fetchRegions();
      return data;
    } catch (err) {
      console.error('Error creating geofence region:', err);
      throw err;
    }
  }, [fetchRegions]);

  const updateRegion = useCallback(async (id: string, updates: Partial<GeofenceRegion>) => {
    try {
      const { error } = await supabase
        .from('geofence_regions')
        .update({
          name: updates.name,
          latitude: updates.latitude,
          longitude: updates.longitude,
          radius_meters: updates.radiusMeters,
          description: updates.description,
          active: updates.active,
        })
        .eq('id', id);

      if (error) throw error;

      await fetchRegions();
    } catch (err) {
      console.error('Error updating geofence region:', err);
      throw err;
    }
  }, [fetchRegions]);

  const deleteRegion = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('geofence_regions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchRegions();
    } catch (err) {
      console.error('Error deleting geofence region:', err);
      throw err;
    }
  }, [fetchRegions]);

  useEffect(() => {
    fetchRegions();
  }, [fetchRegions]);

  return {
    regions,
    isLoading,
    error,
    refetch: fetchRegions,
    createRegion,
    updateRegion,
    deleteRegion,
  };
}

// Helper function
function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Log geofence events to database for analytics
 */
export async function logGeofenceEvent(event: GeofenceEvent, userId?: string) {
  try {
    await supabase.from('geofence_events').insert({
      user_id: userId,
      region_id: event.region.id,
      event_type: event.type,
      latitude: event.userLocation.latitude,
      longitude: event.userLocation.longitude,
      timestamp: event.timestamp.toISOString(),
    });
  } catch (error) {
    console.error('Error logging geofence event:', error);
  }
}
