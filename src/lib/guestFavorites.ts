/**
 * Guest (unauthenticated) favorites store (WEB-FEAT-006).
 *
 * Lets anonymous visitors save a few items before hitting an auth wall —
 * visitors who invest first convert far better. Backed by @/lib/safeStorage
 * (never raw localStorage) under a VERSIONED key so the on-disk schema can
 * evolve per the CLAUDE.md on-disk-state rules. Exposes a tiny external store
 * (subscribe/getSnapshot) so every FavoriteButton stays in sync.
 */
import { storage } from "@/lib/safeStorage";

export type GuestFavoriteType =
  | "event"
  | "restaurant"
  | "attraction"
  | "hotel"
  | "playground";

export interface GuestFavorite {
  type: GuestFavoriteType;
  id: string;
  savedAt: number;
}

/** Max items an anonymous visitor may save before the signup prompt. */
export const GUEST_FAVORITE_CAP = 3;

const STORAGE_KEY = "dmi-guest-favorites-v1";

// In-memory cache so getSnapshot returns a stable reference between mutations
// (required by useSyncExternalStore to avoid render loops).
let cache: GuestFavorite[] | null = null;
const listeners = new Set<() => void>();

function read(): GuestFavorite[] {
  if (cache) return cache;
  const raw = storage.get<GuestFavorite[]>(STORAGE_KEY, []);
  cache = Array.isArray(raw) ? raw : [];
  return cache;
}

function write(next: GuestFavorite[]): void {
  cache = next;
  storage.set(STORAGE_KEY, next);
  listeners.forEach((l) => l());
}

export function subscribeGuestFavorites(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getGuestFavorites(): GuestFavorite[] {
  return read();
}

export function isGuestFavorited(type: GuestFavoriteType, id: string): boolean {
  return read().some((f) => f.type === type && f.id === id);
}

export function guestFavoriteCount(): number {
  return read().length;
}

export type GuestToggleResult =
  | { action: "added"; count: number }
  | { action: "removed"; count: number }
  | { action: "capped"; count: number };

/**
 * Toggle a guest favorite. Returns "capped" (without mutating) when adding
 * would exceed {@link GUEST_FAVORITE_CAP}, so callers can show the signup
 * prompt.
 */
export function toggleGuestFavorite(
  type: GuestFavoriteType,
  id: string
): GuestToggleResult {
  const current = read();
  const existing = current.find((f) => f.type === type && f.id === id);
  if (existing) {
    const next = current.filter((f) => !(f.type === type && f.id === id));
    write(next);
    return { action: "removed", count: next.length };
  }
  if (current.length >= GUEST_FAVORITE_CAP) {
    return { action: "capped", count: current.length };
  }
  const next = [...current, { type, id, savedAt: Date.now() }];
  write(next);
  return { action: "added", count: next.length };
}

/** Clear all guest favorites (call after migrating them to a real account). */
export function clearGuestFavorites(): void {
  write([]);
}
