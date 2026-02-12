/**
 * OfflineBanner
 *
 * Displayed at the top of the app when the device loses network connectivity.
 * Uses a slide-down animation and disappears when connectivity is restored.
 */

import React from 'react';
import { WifiOff } from 'lucide-react';
import { useMobileApp } from './MobileAppProvider';

export function OfflineBanner() {
  const { isConnected } = useMobileApp();

  if (isConnected) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-0 left-0 right-0 z-[9999] bg-destructive text-destructive-foreground px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2 animate-in slide-in-from-top duration-300 safe-area-top"
    >
      <WifiOff className="h-4 w-4" aria-hidden="true" />
      <span>You're offline. Some features may be unavailable.</span>
    </div>
  );
}
