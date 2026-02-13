/**
 * React hook for monitoring network connectivity.
 *
 * Uses the Capacitor Network plugin for reliable connectivity detection.
 * Provides online/offline status that can be used to show offline banners,
 * queue actions, or switch to cached data.
 */

import { useState, useEffect } from 'react';
import { Network, type ConnectionStatus } from '@capacitor/network';
import { isNative, isPluginAvailable } from '../config/platform';

export interface UseNetworkStatusReturn {
  isConnected: boolean;
  connectionType: string;
}

/**
 * Monitor network connectivity status.
 *
 * @example
 * ```tsx
 * function AppShell() {
 *   const { isConnected } = useNetworkStatus();
 *
 *   return (
 *     <>
 *       {!isConnected && <OfflineBanner />}
 *       <App />
 *     </>
 *   );
 * }
 * ```
 */
export function useNetworkStatus(): UseNetworkStatusReturn {
  const [status, setStatus] = useState<ConnectionStatus>({
    connected: true,
    connectionType: 'wifi',
  });

  useEffect(() => {
    if (!isNative || !isPluginAvailable('Network')) {
      // Fall back to web online/offline events
      const handleOnline = () =>
        setStatus({ connected: true, connectionType: 'wifi' });
      const handleOffline = () =>
        setStatus({ connected: false, connectionType: 'none' });

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      setStatus({
        connected: navigator.onLine,
        connectionType: navigator.onLine ? 'wifi' : 'none',
      });

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    // Get initial status
    Network.getStatus().then(setStatus);

    // Listen for changes
    const listener = Network.addListener('networkStatusChange', setStatus);

    return () => {
      listener.then((l) => l.remove());
    };
  }, []);

  return {
    isConnected: status.connected,
    connectionType: status.connectionType,
  };
}
