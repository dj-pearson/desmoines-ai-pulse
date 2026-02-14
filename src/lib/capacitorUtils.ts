/**
 * Capacitor Platform Utilities
 *
 * Provides safe, build-agnostic helpers for detecting and interacting with
 * the Capacitor native runtime. These functions use the global
 * `window.Capacitor` object rather than ES imports so the *web* production
 * build (which doesn't ship Capacitor) never tries to resolve the package.
 */

/* ------------------------------------------------------------------ */
/* Build-time constant injected by mobile-app/vite.config.mobile.ts   */
/* ------------------------------------------------------------------ */
declare const __MOBILE_APP__: boolean | undefined;

/* ------------------------------------------------------------------ */
/* Runtime type augmentations (window.Capacitor)                      */
/* ------------------------------------------------------------------ */
interface CapacitorGlobal {
  isNativePlatform: () => boolean;
  getPlatform: () => string; // 'ios' | 'android' | 'web'
  Plugins: {
    Browser?: {
      open: (opts: { url: string; windowName?: string }) => Promise<void>;
      close: () => Promise<void>;
    };
    SplashScreen?: {
      hide: () => Promise<void>;
      show: () => Promise<void>;
    };
    StatusBar?: {
      setStyle: (opts: { style: string }) => Promise<void>;
      setBackgroundColor: (opts: { color: string }) => Promise<void>;
    };
    App?: {
      addListener: (event: string, cb: (...args: unknown[]) => void) => { remove: () => void };
    };
    Haptics?: {
      impact: (opts: { style: string }) => Promise<void>;
    };
    Share?: {
      share: (opts: { title?: string; text?: string; url?: string; dialogTitle?: string }) => Promise<void>;
    };
    [key: string]: unknown;
  };
}

declare global {
  interface Window {
    Capacitor?: CapacitorGlobal;
  }
}

/* ------------------------------------------------------------------ */
/* Detection helpers                                                   */
/* ------------------------------------------------------------------ */

/**
 * Returns true when running inside Capacitor's native shell
 * (iOS WKWebView or Android WebView).
 */
export function isCapacitor(): boolean {
  try {
    return !!window.Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

/**
 * Returns true when the bundle was produced by the mobile Vite config.
 * This is a *build-time* flag – it's always `false` in web builds.
 */
export function isMobileApp(): boolean {
  try {
    return typeof __MOBILE_APP__ !== 'undefined' && __MOBILE_APP__ === true;
  } catch {
    return false;
  }
}

/**
 * Returns the native platform string ('ios' | 'android' | 'web').
 */
export function getPlatform(): string {
  try {
    return window.Capacitor?.getPlatform?.() ?? 'web';
  } catch {
    return 'web';
  }
}

/* ------------------------------------------------------------------ */
/* External link helper                                               */
/* ------------------------------------------------------------------ */

/**
 * Opens a URL externally.
 *
 * - In Capacitor → uses the Browser plugin to open the system browser
 * - On web → uses window.open (standard _blank behaviour)
 *
 * Returns a boolean indicating whether the open was attempted.
 */
export async function openExternalUrl(url: string): Promise<boolean> {
  if (!url) return false;

  try {
    if (isCapacitor() && window.Capacitor?.Plugins?.Browser) {
      await window.Capacitor.Plugins.Browser.open({ url });
      return true;
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[capacitorUtils] Browser.open failed, falling back:', err);
    }
  }

  // Fallback – works everywhere
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

/* ------------------------------------------------------------------ */
/* Native share helper                                                */
/* ------------------------------------------------------------------ */

/**
 * Shares content using the native share sheet (Capacitor) or
 * falls back to the Web Share API / clipboard.
 */
export async function nativeShare(opts: {
  title?: string;
  text?: string;
  url?: string;
}): Promise<boolean> {
  try {
    if (isCapacitor() && window.Capacitor?.Plugins?.Share) {
      await window.Capacitor.Plugins.Share.share({
        title: opts.title,
        text: opts.text,
        url: opts.url,
        dialogTitle: opts.title,
      });
      return true;
    }

    // Web Share API fallback
    if (navigator.share) {
      await navigator.share(opts);
      return true;
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[capacitorUtils] share failed:', err);
    }
  }

  return false;
}

/* ------------------------------------------------------------------ */
/* Haptic feedback                                                    */
/* ------------------------------------------------------------------ */

/**
 * Triggers a light haptic tap if Haptics plugin is available.
 */
export async function hapticTap(): Promise<void> {
  try {
    if (isCapacitor() && window.Capacitor?.Plugins?.Haptics) {
      await window.Capacitor.Plugins.Haptics.impact({ style: 'Light' });
    }
  } catch {
    // ignore
  }
}
