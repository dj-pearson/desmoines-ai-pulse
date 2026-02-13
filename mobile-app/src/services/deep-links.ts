/**
 * Deep Linking / Universal Links Service
 *
 * Handles incoming URLs from:
 * - Universal Links (iOS) / App Links (Android) — e.g., https://desmoinespulse.com/events/xyz
 * - Custom URL scheme — e.g., dmpulse://events/xyz
 * - Deferred deep links from app store install flows
 *
 * Maps external URLs to internal React Router paths.
 */

import { isNative } from '../config/platform';

/**
 * Route mapping for deep links.
 * Maps URL patterns to React Router paths.
 */
const DEEP_LINK_ROUTES: Array<{
  pattern: RegExp;
  toPath: (matches: RegExpMatchArray) => string;
}> = [
  // Events
  { pattern: /\/events\/today\/?$/, toPath: () => '/events/today' },
  { pattern: /\/events\/this-weekend\/?$/, toPath: () => '/events/this-weekend' },
  { pattern: /\/events\/free\/?$/, toPath: () => '/events/free' },
  { pattern: /\/events\/([^/]+)\/?$/, toPath: (m) => `/events/${m[1]}` },
  { pattern: /\/events\/?$/, toPath: () => '/events' },

  // Restaurants
  { pattern: /\/restaurants\/open-now\/?$/, toPath: () => '/restaurants/open-now' },
  { pattern: /\/restaurants\/([^/]+)\/?$/, toPath: (m) => `/restaurants/${m[1]}` },
  { pattern: /\/restaurants\/?$/, toPath: () => '/restaurants' },

  // Attractions
  { pattern: /\/attractions\/([^/]+)\/?$/, toPath: (m) => `/attractions/${m[1]}` },
  { pattern: /\/attractions\/?$/, toPath: () => '/attractions' },

  // Trip Planner
  { pattern: /\/trip-planner\/?$/, toPath: () => '/trip-planner' },

  // Articles
  { pattern: /\/articles\/([^/]+)\/?$/, toPath: (m) => `/articles/${m[1]}` },
  { pattern: /\/articles\/?$/, toPath: () => '/articles' },

  // Neighborhoods
  { pattern: /\/neighborhoods\/([^/]+)\/?$/, toPath: (m) => `/neighborhoods/${m[1]}` },
  { pattern: /\/neighborhoods\/?$/, toPath: () => '/neighborhoods' },

  // Auth
  { pattern: /\/auth\/callback\/?/, toPath: () => '/auth/callback' },
  { pattern: /\/auth\/?$/, toPath: () => '/auth' },

  // Profile / Dashboard
  { pattern: /\/profile\/?$/, toPath: () => '/profile' },
  { pattern: /\/dashboard\/?$/, toPath: () => '/dashboard' },

  // Search
  { pattern: /\/search\/?/, toPath: () => '/search' },
];

/**
 * Parse a deep link URL and return the corresponding React Router path.
 * Returns '/' if no matching route is found.
 */
export function resolveDeepLink(url: string): string {
  if (!url) return '/';

  let pathname: string;

  try {
    // Handle full URLs (universal links)
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const parsed = new URL(url);
      pathname = parsed.pathname + parsed.search;
    }
    // Handle custom scheme URLs (dmpulse://events/xyz)
    else if (url.startsWith('dmpulse://')) {
      pathname = '/' + url.replace('dmpulse://', '');
    }
    // Handle raw paths
    else {
      pathname = url.startsWith('/') ? url : '/' + url;
    }
  } catch {
    return '/';
  }

  // Try to match against known routes
  for (const route of DEEP_LINK_ROUTES) {
    const match = pathname.match(route.pattern);
    if (match) {
      return route.toPath(match);
    }
  }

  // Fallback: return the path as-is (React Router will handle 404)
  return pathname;
}

/**
 * Generate a universal link URL for sharing content from the app.
 */
export function generateUniversalLink(path: string): string {
  const baseUrl = import.meta.env.VITE_SITE_URL || 'https://desmoinespulse.com';
  return `${baseUrl}${path.startsWith('/') ? path : '/' + path}`;
}

/**
 * Configuration for the apple-app-site-association and assetlinks.json files
 * needed for Universal Links (iOS) and App Links (Android).
 *
 * These files must be hosted at:
 * - iOS: https://desmoinespulse.com/.well-known/apple-app-site-association
 * - Android: https://desmoinespulse.com/.well-known/assetlinks.json
 */
export const DEEP_LINK_CONFIG = {
  ios: {
    teamId: 'TEAM_ID_HERE', // Apple Developer Team ID
    bundleId: 'com.desmoines.aipulse',
    paths: [
      '/events/*',
      '/restaurants/*',
      '/attractions/*',
      '/trip-planner',
      '/articles/*',
      '/neighborhoods/*',
      '/search',
      '/auth/callback',
    ],
  },
  android: {
    packageName: 'com.desmoines.aipulse',
    sha256CertFingerprints: [
      // Production signing key fingerprint goes here
      'SHA256_FINGERPRINT_HERE',
    ],
    paths: [
      '/events/*',
      '/restaurants/*',
      '/attractions/*',
      '/trip-planner',
      '/articles/*',
      '/neighborhoods/*',
      '/search',
    ],
  },
} as const;
