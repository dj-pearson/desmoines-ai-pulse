/**
 * Native Bridge Service
 *
 * Central initialization and lifecycle management for all Capacitor plugins.
 * This is called once at app startup from the mobile entry point.
 */

import { App, type URLOpenListenerEvent } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { Network, type ConnectionStatus } from '@capacitor/network';
import { isNative, isIOS, isAndroid, isPluginAvailable } from '../config/platform';

export interface NativeBridgeOptions {
  onDeepLink?: (url: string) => void;
  onNetworkChange?: (status: ConnectionStatus) => void;
  onBackButton?: () => void;
}

/**
 * Initialize all native plugins and register lifecycle listeners.
 * Call this once at app startup, before rendering the React tree.
 */
export async function initializeNativeBridge(options: NativeBridgeOptions = {}): Promise<void> {
  if (!isNative) return;

  // Run initializations in parallel where possible
  await Promise.allSettled([
    initializeStatusBar(),
    initializeKeyboard(),
    initializeSplashScreen(),
  ]);

  // Register event listeners
  registerDeepLinkListener(options.onDeepLink);
  registerNetworkListener(options.onNetworkChange);
  registerBackButtonListener(options.onBackButton);
}

/**
 * Configure the native status bar appearance.
 */
async function initializeStatusBar(): Promise<void> {
  if (!isPluginAvailable('StatusBar')) return;

  try {
    await StatusBar.setStyle({ style: Style.Dark });

    if (isAndroid) {
      await StatusBar.setBackgroundColor({ color: '#000000' });
      // Enable overlay mode for edge-to-edge display (Android 15 requirement)
      await StatusBar.setOverlaysWebView({ overlay: true });
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('StatusBar initialization failed:', error);
    }
  }
}

/**
 * Configure the native keyboard behavior.
 */
async function initializeKeyboard(): Promise<void> {
  if (!isPluginAvailable('Keyboard')) return;

  try {
    // Resize the web view when keyboard appears (better than pan)
    await Keyboard.setResizeMode({ mode: KeyboardResize.Native });

    if (isIOS) {
      // Disable the accessory bar on iOS for cleaner look
      await Keyboard.setAccessoryBarVisible({ isVisible: false });
    }

    // Hide keyboard on scroll
    await Keyboard.setScroll({ isDisabled: false });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Keyboard initialization failed:', error);
    }
  }
}

/**
 * Hide the splash screen after the app has initialized.
 */
async function initializeSplashScreen(): Promise<void> {
  if (!isPluginAvailable('SplashScreen')) return;

  try {
    // The splash screen will be hidden after the app renders.
    // We set autoHide to false in capacitor.config.ts so we control timing.
    await SplashScreen.hide({ fadeOutDuration: 300 });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('SplashScreen hide failed:', error);
    }
  }
}

/**
 * Register a listener for deep link / universal link events.
 */
function registerDeepLinkListener(callback?: (url: string) => void): void {
  if (!callback) return;

  App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
    // Parse the URL and extract the path for React Router navigation
    try {
      const url = new URL(event.url);
      const path = url.pathname + url.search + url.hash;
      callback(path);
    } catch {
      // If URL parsing fails, pass the raw URL
      callback(event.url);
    }
  });
}

/**
 * Register a listener for network connectivity changes.
 */
function registerNetworkListener(callback?: (status: ConnectionStatus) => void): void {
  if (!callback) return;

  Network.addListener('networkStatusChange', callback);
}

/**
 * Register a handler for the hardware back button (Android).
 */
function registerBackButtonListener(callback?: () => void): void {
  if (!isAndroid || !callback) return;

  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      callback();
    }
  });
}

/**
 * Get the current network status.
 */
export async function getNetworkStatus(): Promise<ConnectionStatus> {
  return Network.getStatus();
}

/**
 * Clean up all native event listeners. Call on app unmount.
 */
export async function cleanupNativeBridge(): Promise<void> {
  if (!isNative) return;

  await Promise.allSettled([
    App.removeAllListeners(),
    Network.removeAllListeners(),
    Keyboard.removeAllListeners(),
  ]);
}
