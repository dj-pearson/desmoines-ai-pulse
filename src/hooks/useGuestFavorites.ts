import { useSyncExternalStore, useCallback } from "react";
import { storage } from "@/lib/safeStorage";

/**
 * Guest (anonymous) favorites — let visitors save a few items before hitting a
 * sign-up wall (WEB-FEAT-006). Backed by versioned safeStorage (never raw
 * localStorage) and a tiny module-level pub/sub store so every FavoriteButton
 * stays in sync. On login the items migrate to the user's server favorites.
 */

export type GuestFavoriteType = "event" | "restaurant" | "attraction" | "playground";

export interface GuestFavorite {
  contentType: GuestFavoriteType;
  contentId: string;
  name?: string;
  savedAt: number;
}

/** Versioned key (CLAUDE.md on-disk-state rule): bump the suffix to migrate. */
const STORAGE_KEY = "guest_favorites_v1";
export const GUEST_FAVORITE_LIMIT = 3;

interface GuestFavoritesSchema {
  version: 1;
  items: GuestFavorite[];
}

let cache: GuestFavorite[] | null = null;
const listeners = new Set<() => void>();

function read(): GuestFavorite[] {
  if (cache) return cache;
  const stored = storage.get<GuestFavoritesSchema>(STORAGE_KEY, { version: 1, items: [] });
  cache = Array.isArray(stored?.items) ? stored!.items : [];
  return cache;
}

function write(items: GuestFavorite[]) {
  cache = items;
  storage.set<GuestFavoritesSchema>(STORAGE_KEY, { version: 1, items });
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Snapshot for non-React callers (migration). */
export function readGuestFavorites(): GuestFavorite[] {
  return read().slice();
}

export function clearGuestFavorites(): void {
  write([]);
}

export type GuestToggleResult =
  | { status: "added"; count: number }
  | { status: "removed"; count: number }
  | { status: "cap_reached"; count: number };

export function toggleGuestFavorite(fav: Omit<GuestFavorite, "savedAt">): GuestToggleResult {
  const items = read();
  const idx = items.findIndex(
    (f) => f.contentType === fav.contentType && f.contentId === fav.contentId,
  );
  if (idx >= 0) {
    const next = items.slice();
    next.splice(idx, 1);
    write(next);
    return { status: "removed", count: next.length };
  }
  if (items.length >= GUEST_FAVORITE_LIMIT) {
    return { status: "cap_reached", count: items.length };
  }
  const next = [...items, { ...fav, savedAt: Date.now() }];
  write(next);
  return { status: "added", count: next.length };
}

export function useGuestFavorites() {
  const items = useSyncExternalStore(subscribe, read, read);

  const isGuestFavorited = useCallback(
    (contentType: string, contentId: string) =>
      items.some((f) => f.contentType === contentType && f.contentId === contentId),
    [items],
  );

  return {
    guestFavorites: items,
    count: items.length,
    limit: GUEST_FAVORITE_LIMIT,
    isGuestFavorited,
    toggleGuestFavorite,
    clearGuestFavorites,
  };
}
