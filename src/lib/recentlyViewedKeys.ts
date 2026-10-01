/**
 * Storage keys for the recently viewed store, in a module with no imports.
 *
 * AuthContext clears these on logout (via userPreferencesStore). Importing
 * them from recentlyViewed.ts pulled timezone.ts, and with it date-fns and
 * date-fns-tz, into the entry chunk of every route (the same trap WEB-PERF-020
 * describes for dompurify). recentlyViewed.ts re-exports them.
 */
export const RECENTLY_VIEWED_KEY = "dmi_recently_viewed_v1";

/**
 * Keys the old per-type hooks in the (now deleted) useRecentlyViewed.ts wrote.
 * EventCard wrote the events one on every quick-view open, so a visitor's
 * recent history lived there and the home rail never saw it. readRecentlyViewed
 * folds them into RECENTLY_VIEWED_KEY on first read and deletes the old key.
 * Keep this for one release (the storage rule in CLAUDE.md), then drop it.
 */
export const LEGACY_EVENTS_KEY = "desmoines_recently_viewed";
export const LEGACY_RESTAURANTS_KEY = "desmoines_recently_viewed_restaurants";
export const LEGACY_RECENTLY_VIEWED_KEYS = [LEGACY_EVENTS_KEY, LEGACY_RESTAURANTS_KEY] as const;
