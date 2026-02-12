/**
 * Platform detection and configuration for mobile apps.
 *
 * Detects whether the app is running inside a Capacitor native container
 * (iOS or Android) vs. a regular web browser. This is used throughout
 * the mobile app to enable/disable native features.
 */

import { Capacitor } from '@capacitor/core';

export type Platform = 'ios' | 'android' | 'web';

/**
 * Current platform the app is running on.
 */
export const currentPlatform: Platform = Capacitor.getPlatform() as Platform;

/**
 * Whether the app is running inside a native Capacitor shell.
 */
export const isNative: boolean = Capacitor.isNativePlatform();

/**
 * Whether the app is running on iOS (inside Capacitor).
 */
export const isIOS: boolean = currentPlatform === 'ios';

/**
 * Whether the app is running on Android (inside Capacitor).
 */
export const isAndroid: boolean = currentPlatform === 'android';

/**
 * Whether the app is running in a web browser (not Capacitor).
 */
export const isWeb: boolean = currentPlatform === 'web';

/**
 * Check if a specific Capacitor plugin is available on the current platform.
 */
export function isPluginAvailable(pluginName: string): boolean {
  return Capacitor.isPluginAvailable(pluginName);
}

/**
 * Platform-specific configuration values.
 */
export const platformConfig = {
  /** Safe area insets are handled natively on iOS, need CSS on Android */
  usesCSSsafeArea: isAndroid,
  /** iOS uses the native swipe-back gesture */
  hasNativeBackGesture: isIOS,
  /** Android has a system back button/gesture */
  hasSystemBackButton: isAndroid,
  /** Status bar height varies by platform */
  statusBarOffset: isIOS ? 44 : isAndroid ? 24 : 0,
  /** Bottom nav safe area for devices with home indicators */
  bottomSafeArea: isIOS ? 34 : 0,
};
