/**
 * Hook for accessing platform information in React components.
 */

import { useMemo } from 'react';
import {
  currentPlatform,
  isNative,
  isIOS,
  isAndroid,
  isWeb,
  platformConfig,
  type Platform,
} from '../config/platform';

export interface NativePlatformInfo {
  platform: Platform;
  isNative: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isWeb: boolean;
  config: typeof platformConfig;
}

/**
 * Access platform detection and configuration values in React components.
 *
 * @example
 * ```tsx
 * const { isIOS, isNative } = useNativePlatform();
 *
 * return (
 *   <div style={{ paddingTop: isIOS ? 44 : 0 }}>
 *     {isNative && <NativeFeature />}
 *   </div>
 * );
 * ```
 */
export function useNativePlatform(): NativePlatformInfo {
  return useMemo(
    () => ({
      platform: currentPlatform,
      isNative,
      isIOS,
      isAndroid,
      isWeb,
      config: platformConfig,
    }),
    []
  );
}
