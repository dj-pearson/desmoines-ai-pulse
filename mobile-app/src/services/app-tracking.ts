/**
 * App Tracking Transparency (ATT) Service
 *
 * Required by Apple since iOS 14.5. Any app that tracks user data across
 * apps/websites owned by other companies must request permission via
 * the ATT framework.
 *
 * This MUST be called before initializing any analytics or advertising SDKs.
 */

import { isIOS, isNative } from '../config/platform';

export type TrackingAuthorizationStatus =
  | 'authorized'
  | 'denied'
  | 'notDetermined'
  | 'restricted';

/**
 * Request App Tracking Transparency authorization (iOS only).
 *
 * Returns the user's choice. On Android or web, always returns 'authorized'
 * since ATT is an iOS-only requirement.
 *
 * Call this BEFORE initializing analytics.
 */
export async function requestTrackingAuthorization(): Promise<TrackingAuthorizationStatus> {
  if (!isNative || !isIOS) {
    return 'authorized';
  }

  try {
    // Use the Capacitor plugin for ATT
    const { AppTrackingTransparency } = await import(
      'capacitor-plugin-app-tracking-transparency'
    );

    const status = await AppTrackingTransparency.getStatus();

    if (status.status === 'notDetermined') {
      const result = await AppTrackingTransparency.requestPermission();
      return result.status as TrackingAuthorizationStatus;
    }

    return status.status as TrackingAuthorizationStatus;
  } catch {
    // If the plugin isn't available, default to authorized
    // (the app doesn't do cross-app tracking without explicit SDKs)
    return 'authorized';
  }
}

/**
 * Check the current ATT authorization status without prompting.
 */
export async function getTrackingAuthorizationStatus(): Promise<TrackingAuthorizationStatus> {
  if (!isNative || !isIOS) {
    return 'authorized';
  }

  try {
    const { AppTrackingTransparency } = await import(
      'capacitor-plugin-app-tracking-transparency'
    );
    const status = await AppTrackingTransparency.getStatus();
    return status.status as TrackingAuthorizationStatus;
  } catch {
    return 'authorized';
  }
}

/**
 * Whether the user has authorized tracking.
 */
export async function isTrackingAuthorized(): Promise<boolean> {
  const status = await getTrackingAuthorizationStatus();
  return status === 'authorized';
}
