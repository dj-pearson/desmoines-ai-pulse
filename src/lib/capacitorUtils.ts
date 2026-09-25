/**
 * Capacitor Platform Utilities
 *
 * Provides safe, build-agnostic helpers for detecting and interacting with
 * the Capacitor native runtime. These functions use the global
 * `window.Capacitor` object rather than ES imports so the *web* production
 * build (which doesn't ship Capacitor) never tries to resolve the package.
 */

/* ------------------------------------------------------------------ */
/* Build-time constant injected by vite.config.mobile.ts              */
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
    Keyboard?: {
      addListener: (event: string, cb: (info: { keyboardHeight: number }) => void) => Promise<{ remove: () => void }>;
      removeAllListeners: () => Promise<void>;
      hide: () => Promise<void>;
      setAccessoryBarVisible: (opts: { isVisible: boolean }) => Promise<void>;
      setScroll: (opts: { isDisabled: boolean }) => Promise<void>;
    };
    Network?: {
      addListener: (event: string, cb: (status: { connected: boolean; connectionType: string }) => void) => Promise<{ remove: () => void }>;
      getStatus: () => Promise<{ connected: boolean; connectionType: string }>;
    };
    PushNotifications?: {
      checkPermissions: () => Promise<{ receive: string }>;
      requestPermissions: () => Promise<{ receive: string }>;
      register: () => Promise<void>;
      addListener: (event: string, cb: (data: unknown) => void) => Promise<{ remove: () => void }>;
      removeAllListeners: () => Promise<void>;
    };
    LocalNotifications?: {
      schedule: (opts: { notifications: unknown[] }) => Promise<void>;
      cancel: (opts: { notifications: Array<{ id: number }> }) => Promise<void>;
      removeAllListeners: () => Promise<void>;
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

import { createLogger } from '@/lib/logger';

const logger = createLogger('capacitorUtils');

/* ------------------------------------------------------------------ */
/* External link helper                                               */
/* ------------------------------------------------------------------ */

/**
 * Returns the URL normalised by the URL parser when its scheme is http: or
 * https:, otherwise null.
 *
 * Every external link on the site ultimately comes from a scraper
 * (`events.source_url`) or an advertiser (`campaign_creatives.link_url`), so
 * neither can be trusted to hold a web URL. `javascript:`, `data:`, `file:`,
 * `intent:` and friends are refused here, in one place, rather than at each
 * call site. Relative URLs are refused too: an "external" link that resolves
 * against our own origin is a data error, not a link.
 */
export function toSafeExternalUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed.href;
}

/**
 * Opens a URL externally.
 *
 * - In Capacitor -> uses the Browser plugin to open the system browser
 * - On web -> uses window.open (standard _blank behaviour)
 *
 * Refuses anything that is not an absolute http(s) URL (see
 * `toSafeExternalUrl`) and returns false without opening anything.
 * Otherwise returns true to say the open was attempted.
 */
export async function openExternalUrl(url: string): Promise<boolean> {
  const safeUrl = toSafeExternalUrl(url);
  if (!safeUrl) {
    logger.warn('openExternalUrl', 'Refused non-http(s) URL');
    return false;
  }

  try {
    if (isCapacitor() && window.Capacitor?.Plugins?.Browser) {
      await window.Capacitor.Plugins.Browser.open({ url: safeUrl });
      return true;
    }
  } catch (err) {
    logger.warn('openExternalUrl', 'Browser.open failed, falling back', { error: String(err) });
  }

  // Fallback - works everywhere
  window.open(safeUrl, '_blank', 'noopener,noreferrer');
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
    logger.warn('nativeShare', 'share failed', { error: String(err) });
  }

  return false;
}

export type ShareOutcome = 'shared' | 'cancelled' | 'unavailable';

/** True when a share rejection means the person closed the sheet. */
function isShareCancel(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  const message = String((err as { message?: unknown } | null)?.message ?? err ?? '');
  return /cancel/i.test(message);
}

/**
 * nativeShare with the outcome spelled out. nativeShare answers false for a
 * cancel and for "no share sheet here" alike, so a caller that falls back to
 * the clipboard overwrote whatever the person had copied after they chose not
 * to share. 'cancelled' is the person's answer and needs no fallback;
 * 'unavailable' (no sheet, or it failed) does.
 */
export async function shareWithOutcome(opts: {
  title?: string;
  text?: string;
  url?: string;
}): Promise<ShareOutcome> {
  try {
    if (isCapacitor() && window.Capacitor?.Plugins?.Share) {
      await window.Capacitor.Plugins.Share.share({
        title: opts.title,
        text: opts.text,
        url: opts.url,
        dialogTitle: opts.title,
      });
      return 'shared';
    }
    if (typeof navigator.share === 'function') {
      await navigator.share(opts);
      return 'shared';
    }
  } catch (err) {
    if (isShareCancel(err)) return 'cancelled';
    logger.warn('shareWithOutcome', 'share failed', { error: String(err) });
  }
  return 'unavailable';
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
