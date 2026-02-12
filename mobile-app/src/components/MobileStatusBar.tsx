/**
 * MobileStatusBar
 *
 * Provides the correct spacing for the native status bar area on iOS and Android.
 * This ensures content doesn't render behind the system status bar.
 */

import React from 'react';
import { isNative, isIOS, isAndroid } from '../config/platform';

/**
 * Spacer component that accounts for the native status bar height.
 * Use this at the top of your app layout when the status bar overlays content.
 */
export function MobileStatusBarSpacer() {
  if (!isNative) return null;

  return (
    <div
      className="w-full safe-area-top"
      style={{
        // Fallback heights if env() safe area insets aren't supported
        minHeight: isIOS ? 'env(safe-area-inset-top, 44px)' : isAndroid ? 'env(safe-area-inset-top, 24px)' : 0,
      }}
      aria-hidden="true"
    />
  );
}
