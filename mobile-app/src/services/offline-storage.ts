/**
 * Offline Storage Service
 *
 * Uses Capacitor Preferences for persistent key-value storage that
 * survives app restarts. This replaces localStorage for mobile apps
 * since localStorage can be cleared by the OS under memory pressure.
 *
 * Also provides a caching layer for offline-first data access.
 */

import { Preferences } from '@capacitor/preferences';
import { isNative, isPluginAvailable } from '../config/platform';

const CACHE_PREFIX = 'cache:';
const CACHE_TTL_PREFIX = 'cache_ttl:';

/**
 * Store a value persistently in native storage.
 */
export async function setItem(key: string, value: unknown): Promise<void> {
  const serialized = JSON.stringify(value);

  if (isNative && isPluginAvailable('Preferences')) {
    await Preferences.set({ key, value: serialized });
  } else {
    try {
      localStorage.setItem(key, serialized);
    } catch {
      // localStorage full or unavailable
    }
  }
}

/**
 * Retrieve a value from native storage.
 */
export async function getItem<T>(key: string, defaultValue?: T): Promise<T | undefined> {
  try {
    let raw: string | null = null;

    if (isNative && isPluginAvailable('Preferences')) {
      const result = await Preferences.get({ key });
      raw = result.value;
    } else {
      raw = localStorage.getItem(key);
    }

    if (raw === null) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Remove a value from native storage.
 */
export async function removeItem(key: string): Promise<void> {
  if (isNative && isPluginAvailable('Preferences')) {
    await Preferences.remove({ key });
  } else {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  }
}

/**
 * Clear all stored values.
 */
export async function clear(): Promise<void> {
  if (isNative && isPluginAvailable('Preferences')) {
    await Preferences.clear();
  } else {
    try {
      localStorage.clear();
    } catch {
      // Ignore
    }
  }
}

/**
 * Cache data with a TTL (time-to-live) for offline-first access.
 * Data is automatically invalidated after the TTL expires.
 */
export async function cacheData(
  key: string,
  data: unknown,
  ttlMs: number = 5 * 60 * 1000 // Default: 5 minutes
): Promise<void> {
  const expiry = Date.now() + ttlMs;

  await Promise.all([
    setItem(CACHE_PREFIX + key, data),
    setItem(CACHE_TTL_PREFIX + key, expiry),
  ]);
}

/**
 * Retrieve cached data if it hasn't expired.
 * Returns null if the cache is expired or missing.
 */
export async function getCachedData<T>(key: string): Promise<T | null> {
  const [data, expiry] = await Promise.all([
    getItem<T>(CACHE_PREFIX + key),
    getItem<number>(CACHE_TTL_PREFIX + key),
  ]);

  if (data === undefined || expiry === undefined) return null;
  if (Date.now() > expiry) {
    // Cache expired, clean up
    await Promise.all([
      removeItem(CACHE_PREFIX + key),
      removeItem(CACHE_TTL_PREFIX + key),
    ]);
    return null;
  }

  return data;
}

/**
 * Invalidate a specific cache entry.
 */
export async function invalidateCache(key: string): Promise<void> {
  await Promise.all([
    removeItem(CACHE_PREFIX + key),
    removeItem(CACHE_TTL_PREFIX + key),
  ]);
}
