import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor Configuration
 *
 * Central configuration for the native mobile app shell.
 * This file replaces capacitor.config.json with TypeScript for type safety.
 */
const config: CapacitorConfig = {
  appId: 'com.desmoines.aipulse',
  appName: 'DSM AI Pulse',
  webDir: 'www',
  bundledWebRuntime: false,

  // Server configuration
  server: {
    // Use HTTPS scheme for proper cookie/auth handling
    androidScheme: 'https',
    iosScheme: 'https',
    // Hostname for the web view (helps with cookie domain matching)
    hostname: 'app.desmoinespulse.com',
  },

  // ================================================================
  // Plugin Configurations
  // ================================================================

  plugins: {
    // Splash Screen
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true, // Auto-hide after launchShowDuration
      backgroundColor: '#000000',
      showSpinner: false,
      androidSpinnerStyle: 'small',
      iosSpinnerStyle: 'small',
      spinnerColor: '#ffffff',
      // Use the launch screen storyboard / theme
      launchFadeOutDuration: 300,
      androidSplashResourceName: 'splash',
    },

    // Status Bar
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#000000',
      overlaysWebView: true, // Edge-to-edge (Android 15 requirement)
    },

    // Keyboard
    Keyboard: {
      resize: 'native',
      style: 'DARK',
      resizeOnFullScreen: true,
    },

    // Push Notifications
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },

    // Local Notifications
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#488AFF',
      sound: 'beep.wav',
    },

    // Camera
    Camera: {
      // Use the Photos framework on iOS (better UX)
      presentationStyle: 'popover',
    },

    // Geolocation
    Geolocation: {
      // No specific config needed; permissions are handled in native config
    },

    // Preferences (native key-value storage)
    Preferences: {
      // Uses UserDefaults on iOS, SharedPreferences on Android
    },

    // Share
    Share: {
      // No specific config needed
    },

    // Browser (in-app browser for external links)
    Browser: {
      // No specific config needed
    },

    // Network
    Network: {
      // No specific config needed
    },

    // Haptics
    Haptics: {
      // No specific config needed
    },
  },

  // ================================================================
  // iOS-Specific Configuration
  // ================================================================

  ios: {
    contentInset: 'automatic',
    scheme: 'DSM AI Pulse',
    // Prefer WKWebView (default in Capacitor 6)
    preferredContentMode: 'mobile',
    // Allow inline media playback
    allowsLinkPreview: true,
    // Scroll behavior
    scrollEnabled: true,
  },

  // ================================================================
  // Android-Specific Configuration
  // ================================================================

  android: {
    // Security
    allowMixedContent: false,
    captureInput: true,
    // Disable WebView debugging in production
    webContentsDebuggingEnabled: false,
    // Background color while loading
    backgroundColor: '#000000',
    // Edge-to-edge display support (Android 15)
    buildOptions: {
      keystorePath: undefined, // Set during release builds
      keystoreAlias: undefined,
    },
  },
};

export default config;
