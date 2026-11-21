import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface NetworkStatus {
  isOnline: boolean;
  wasOffline: boolean;
  since: Date | null;
}

/**
 * Hook to monitor network connectivity status.
 * Tracks online/offline state and whether the user was recently offline.
 *
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
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  return { isOnline, wasOffline, since };
}
