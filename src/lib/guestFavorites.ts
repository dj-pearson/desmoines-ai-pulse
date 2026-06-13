/**
 * Guest (unauthenticated) event favorites — WEB-FEAT-006 ("kill the save-wall").
 *
 * Lets anonymous visitors save a few favorites before being asked to sign up;
 * visitors who invest first convert far better than those hitting an auth wall.
 *
 * Persisted via @/lib/safeStorage (private-mode safe — never raw localStorage)
 * under a VERSIONED key so the on-disk shape can evolve per CLAUDE.md
 * on-disk-state rules (bump the key suffix + migrate-on-read if it changes).
 *
 * Exposed as a tiny external store (subscribe / getSnapshot) so every
 * FavoriteButton + dashboard stays in sync via useSyncExternalStore — the
 * in-memory `current` array is the cached snapshot reference (stable between
 * mutations) that React's getSnapshot contract requires.
 */
import { storage } from "@/lib/safeStorage";
import { createLogger } from "@/lib/logger";

const logger = createLogger("guestFavorites");

/** Versioned key — bump the suffix and migrate-on-read if the shape changes. */
export const GUEST_FAVORITES_KEY = "guest_favorites_v1";
/** One-shot "we migrated N favorites" notice consumed by the dashboard. */
const GUEST_FAVORITES_MIGRATED_KEY = "guest_favorites_migrated_v1";
/** Guests can save up to this many items before the signup wall (matches the free tier). */
export const GUEST_FAVORITES_CAP = 3;

interface GuestFavoritesShape {
  version: 1;
  eventIds: string[];
}

interface MigratedNotice {
  count: number;
  at: number;
}

function readFromStorage(): string[] {
  const raw = storage.get<GuestFavoritesShape>(GUEST_FAVORITES_KEY);
  if (raw && Array.isArray(raw.eventIds)) {
    // De-dupe + cap defensively in case the stored value was tampered with.
    return Array.from(new Set(raw.eventIds)).slice(0, GUEST_FAVORITES_CAP);
  }
  return [];
}

// Cached snapshot: getSnapshot must return a stable reference between mutations
// or useSyncExternalStore loops. We only replace `current` on an actual change.
let current: string[] = readFromStorage();
const listeners = new Set<() => void>();

function emit(next: string[]): void {
  current = next;
  listeners.forEach((listener) => listener());
}

export function subscribeGuestFavorites(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getGuestFavoritesSnapshot(): string[] {
  return current;
}

export function getGuestFavorites(): string[] {
  return current;
}

export function isGuestFavorited(eventId: string): boolean {
  return current.includes(eventId);
}

/**
 * Add a guest favorite. Returns `atCap: true` (a no-op) when the cap is already
 * reached so the caller can present the signup prompt.
 */
export function addGuestFavorite(eventId: string): { added: boolean; atCap: boolean } {
  if (current.includes(eventId)) return { added: false, atCap: false };
  if (current.length >= GUEST_FAVORITES_CAP) return { added: false, atCap: true };
  const next = [...current, eventId];
  storage.set<GuestFavoritesShape>(GUEST_FAVORITES_KEY, { version: 1, eventIds: next });
  emit(next);
  return { added: true, atCap: false };
}

export function removeGuestFavorite(eventId: string): void {
  if (!current.includes(eventId)) return;
  const next = current.filter((id) => id !== eventId);
  storage.set<GuestFavoritesShape>(GUEST_FAVORITES_KEY, { version: 1, eventIds: next });
  emit(next);
}

/** Clear the local guest copy (after a successful migration to the account). */
export function clearGuestFavorites(): void {
  storage.remove(GUEST_FAVORITES_KEY);
  if (current.length > 0) emit([]);
}

/** Record a one-shot notice that N guest favorites were migrated to the account. */
export function setMigratedFavoritesNotice(count: number): void {
  if (count <= 0) return;
  try {
    storage.set<MigratedNotice>(GUEST_FAVORITES_MIGRATED_KEY, { count, at: Date.now() });
  } catch (error) {
    logger.warn("setMigratedFavoritesNotice", "failed to persist notice", { error: String(error) });
  }
}

/**
 * Read & clear the migration notice so the dashboard acknowledges it exactly
 * once. Returns 0 when there is nothing to acknowledge.
 */
export function consumeMigratedFavoritesNotice(): number {
  const notice = storage.get<MigratedNotice>(GUEST_FAVORITES_MIGRATED_KEY);
  if (notice && typeof notice.count === "number" && notice.count > 0) {
    storage.remove(GUEST_FAVORITES_MIGRATED_KEY);
    return notice.count;
  }
  return 0;
}
