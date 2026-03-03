import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { WifiOff, Wifi } from 'lucide-react';

/**
 * Banner that displays when the user loses network connectivity.
 * Shows a reconnected message briefly when connection is restored.
 * On Capacitor, respects safe area insets so it doesn't overlap the notch.
 */
export function OfflineBanner() {
  const { isOnline, wasOffline } = useNetworkStatus();

  if (isOnline && !wasOffline) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`fixed top-0 left-0 right-0 z-[60] flex items-center justify-center gap-2 px-4 text-sm font-medium transition-colors ${
        isOnline
          ? 'bg-green-600 text-white'
          : 'bg-yellow-600 text-white'
      }`}
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0.5rem))', paddingBottom: '0.5rem' }}
    >
      {isOnline ? (
        <>
          <Wifi className="h-4 w-4" />
          <span>Back online</span>
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          <span>You are offline. Some features may be unavailable.</span>
        </>
      )}
    </div>
  );
}
