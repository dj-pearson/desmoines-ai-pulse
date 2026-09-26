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

/**
 * Max items an anonymous visitor may save before the signup prompt.
 *
 * Kept one below the free plan's favorites limit (subscription_plans.limits,
 * 3 today). At 3 and 3, "create a free account to save more" led to an account
 * that could save nothing more, and the tap that hit the wall - stashed for
 * replay after sign-up - was refused by enforce_favorites_limit. At 2, the two
 * guest saves migrate and the stashed third one lands. If the free limit
 * changes, keep this below it.
 *
 * Guests who saved 3 under the old cap keep them; the cap only stops new adds.
 */
export const GUEST_FAVORITE_CAP = 2;

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

const GUEST_TYPES: readonly GuestFavoriteType[] = [
  "event",
  "restaurant",
  "attraction",
  "hotel",
  "playground",
];

/**
 * The favorite a guest tapped at the cap, from the payload FavoriteButton
 * stashes with stashPendingAction. Null for anything that is not one: the
 * payload comes back out of storage, so its shape is not guaranteed.
 */
export function stashedFavorite(payload: unknown): GuestFavorite | null {
  if (!payload || typeof payload !== "object") return null;
  const { type, id } = payload as { type?: unknown; id?: unknown };
  if (typeof id !== "string" || id.length === 0) return null;
  if (!GUEST_TYPES.includes(type as GuestFavoriteType)) return null;
  return { type: type as GuestFavoriteType, id, savedAt: Date.now() };
}

/** Clear all guest favorites (call after migrating them to a real account). */
export function clearGuestFavorites(): void {
  write([]);
}
