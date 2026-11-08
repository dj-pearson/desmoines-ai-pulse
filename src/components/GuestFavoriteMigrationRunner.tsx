import { useGuestFavoriteMigration } from "@/hooks/useGuestFavoriteMigration";

/**
 * Runs the guest-favorites migration (WEB-FEAT-006). Headless.
 *
 * Loaded lazily by GuestFavoriteMigrator, and only for a signed-in visitor, so
 * the hook and what it imports (guestFavorites, authReturn, favoriteAnalytics)
 * stay out of the entry chunk (WEB-PERF-061). Do not import this
 * statically from eager code; src/__tests__/entryChunkSignedInOnly.test.ts
 * fails if anything does.
 */
export function GuestFavoriteMigrationRunner() {
  useGuestFavoriteMigration();
  return null;
}
