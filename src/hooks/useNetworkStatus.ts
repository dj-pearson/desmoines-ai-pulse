import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isCapacitor } from '@/lib/capacitorUtils';

interface NetworkStatus {
  isOnline: boolean;
  wasOffline: boolean;
  since: Date | null;
}

/**
 * Hook to monitor network connectivity status.
 * Tracks online/offline state and whether the user was recently offline.
 *
 * In Capacitor, uses the Network plugin for more reliable detection.
 * Automatically refetches visible TanStack queries on reconnect.
 */
export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [wasOffline, setWasOffline] = useState(false);
  const [since, setSince] = useState<Date | null>(null);
  const queryClient = useQueryClient();

  const handleOnline = useCallback(() => {
    setIsOnline(true);
    setWasOffline(true);
    setSince(null);
    // Refetch visible queries when coming back online
    queryClient.invalidateQueries();
    // Clear the "was offline" flag after 5 seconds
    setTimeout(() => setWasOffline(false), 5000);
  }, [queryClient]);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    setSince(new Date());
  }, []);

  useEffect(() => {
    // Always listen to browser events as fallback
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // In Capacitor, also use the Network plugin for more reliable detection
    let networkListener: { remove: () => void } | null = null;

    if (isCapacitor()) {
      const network = window.Capacitor?.Plugins?.Network as {
        addListener?: (event: string, cb: (status: { connected: boolean }) => void) => Promise<{ remove: () => void }>;
        getStatus?: () => Promise<{ connected: boolean }>;
      } | undefined;

      if (network?.addListener) {
        network.addListener('networkStatusChange', (status: { connected: boolean }) => {
          if (status.connected) {
            handleOnline();
          } else {
            handleOffline();
          }
        }).then(listener => {
          networkListener = listener;
        });

        // Get initial status from plugin
        network.getStatus?.().then((status: { connected: boolean }) => {
          setIsOnline(status.connected);
        });
      }
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      networkListener?.remove();
    };
  }, [handleOnline, handleOffline]);

  return { isOnline, wasOffline, since };
}
