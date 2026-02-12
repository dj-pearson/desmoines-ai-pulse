/**
 * MobileAppProvider
 *
 * Top-level provider that wraps the entire mobile app. Initializes
 * native plugins, handles deep links, manages network status, and
 * provides mobile-specific context to all child components.
 */

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { isNative, currentPlatform, type Platform } from '../config/platform';
import { initializeNativeBridge, cleanupNativeBridge } from '../services/native-bridge';
import { resolveDeepLink } from '../services/deep-links';
import { requestTrackingAuthorization, type TrackingAuthorizationStatus } from '../services/app-tracking';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

interface MobileAppContextValue {
  platform: Platform;
  isNative: boolean;
  isConnected: boolean;
  connectionType: string;
  isInitialized: boolean;
  trackingStatus: TrackingAuthorizationStatus;
}

const MobileAppContext = createContext<MobileAppContextValue>({
  platform: 'web',
  isNative: false,
  isConnected: true,
  connectionType: 'wifi',
  isInitialized: false,
  trackingStatus: 'notDetermined',
});

export function useMobileApp(): MobileAppContextValue {
  return useContext(MobileAppContext);
}

interface MobileAppProviderProps {
  children: React.ReactNode;
}

export function MobileAppProvider({ children }: MobileAppProviderProps) {
  const navigate = useNavigate();
  const { isConnected, connectionType } = useNetworkStatus();
  const [isInitialized, setIsInitialized] = useState(false);
  const [trackingStatus, setTrackingStatus] = useState<TrackingAuthorizationStatus>('notDetermined');
  const initialized = useRef(false);

  const handleDeepLink = useCallback(
    (url: string) => {
      const path = resolveDeepLink(url);
      navigate(path);
    },
    [navigate]
  );

  const handleBackButton = useCallback(() => {
    // App is at root - minimize (Android only)
    // The native bridge already handles canGoBack logic
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    (async () => {
      if (isNative) {
        // Initialize all native plugins
        await initializeNativeBridge({
          onDeepLink: handleDeepLink,
          onBackButton: handleBackButton,
        });

        // Request ATT authorization (iOS only, must happen before analytics)
        const attStatus = await requestTrackingAuthorization();
        setTrackingStatus(attStatus);
      }

      setIsInitialized(true);
    })();

    return () => {
      cleanupNativeBridge();
    };
  }, [handleDeepLink, handleBackButton]);

  const value: MobileAppContextValue = {
    platform: currentPlatform,
    isNative,
    isConnected,
    connectionType,
    isInitialized,
    trackingStatus,
  };

  return (
    <MobileAppContext.Provider value={value}>
      {children}
    </MobileAppContext.Provider>
  );
}
