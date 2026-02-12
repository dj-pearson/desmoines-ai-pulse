/**
 * Mobile App Barrel Export
 *
 * Re-exports all mobile-specific modules for convenient importing.
 */

// Configuration
export { currentPlatform, isNative, isIOS, isAndroid, isWeb, platformConfig } from './config/platform';

// Services
export { initializeNativeBridge, cleanupNativeBridge, getNetworkStatus } from './services/native-bridge';
export { registerPushNotifications, createNotificationChannels, scheduleLocalNotification, cancelLocalNotification } from './services/push-notifications';
export { resolveDeepLink, generateUniversalLink, DEEP_LINK_CONFIG } from './services/deep-links';
export { checkBiometricAvailability, authenticateWithBiometrics } from './services/biometrics';
export { getCurrentLocation, watchLocation, clearLocationWatch, calculateDistance } from './services/native-geolocation';
export { requestTrackingAuthorization, isTrackingAuthorized } from './services/app-tracking';
export { setItem, getItem, removeItem, cacheData, getCachedData, invalidateCache } from './services/offline-storage';

// Hooks
export { useNativePlatform } from './hooks/useNativePlatform';
export { usePushNotifications } from './hooks/usePushNotifications';
export { useNativeLocation, useLocationWatch } from './hooks/useNativeLocation';
export { useBiometricAuth } from './hooks/useBiometricAuth';
export { useNetworkStatus } from './hooks/useNetworkStatus';

// Components
export { MobileAppProvider, useMobileApp } from './components/MobileAppProvider';
export { OfflineBanner } from './components/OfflineBanner';
export { MobileStatusBarSpacer } from './components/MobileStatusBar';
