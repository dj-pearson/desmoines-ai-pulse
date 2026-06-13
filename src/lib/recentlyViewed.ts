/**
 * Recently-viewed content store — WEB-FEAT-007 ("quick resume + personalization").
 *
 * Records detail-page views ({id, type, timestamp} + the denormalized fields a
 * rail needs to render) for events, restaurants and attractions. Used to power
 * the homepage "Recently viewed" rail, the dashboard list, and the data-driven
 * home section ordering (see @/lib/homeSectionOrder).
 *
 * Persisted via @/lib/safeStorage (private-mode safe — never raw localStorage)
 * under a VERSIONED key so the on-disk shape can evolve per CLAUDE.md
 * on-disk-state rules (bump the suffix + migrate-on-read if it changes).
 *
 * Exposed as a tiny external store (subscribe / getSnapshot) so the rail,
 * dashboard and detail pages stay in sync via useSyncExternalStore — the
 * in-memory `current` array is the cached snapshot reference (stable between
 * mutations) that React's getSnapshot contract requires. Mirrors the
 * guest-favorites store (@/lib/guestFavorites).
 *
 * For signed-in users a server table (`recently_viewed`, RLS owner-only) holds
 * the canonical cross-device history; the local store is still authoritative
 * for rendering (synchronous → no CLS) and is merged with the server copy on
 * sign-in. See @/hooks/useRecentlyViewed.
 */
import { storage } from "@/lib/safeStorage";
import { createLogger } from "@/lib/logger";

const logger = createLogger("recentlyViewed");

/** Versioned key — bump the suffix and migrate-on-read if the shape changes. */
export const RECENTLY_VIEWED_KEY = "recently_viewed_v1";
/** Max entries retained (oldest pruned past this). */
export const RECENTLY_VIEWED_CAP = 20;
/** Entries older than this are pruned on read. */
export const RECENTLY_VIEWED_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type RecentlyViewedType = "event" | "restaurant" | "attraction";

export interface RecentlyViewedEntry {
  id: string;
  type: RecentlyViewedType;
  title: string;
  image_url?: string;
  /** Category / cuisine / area — a short secondary line for the card. */
  subtitle?: string;
  /** Event date (ISO/text), when applicable. */
  date?: string;
  /** Canonical detail-page path (precomputed so links always resolve). */
  path: string;
  viewedAt: number;
}

interface RecentlyViewedShape {
  version: 1;
  items: RecentlyViewedEntry[];
}

function keyOf(id: string, type: RecentlyViewedType): string {
  return `${type}:${id}`;
}

/** Normalize: prune stale, de-dupe by id+type (keep newest), sort desc, cap. */
function normalize(items: RecentlyViewedEntry[]): RecentlyViewedEntry[] {
  const cutoff = Date.now() - RECENTLY_VIEWED_MAX_AGE_MS;
  const byKey = new Map<string, RecentlyViewedEntry>();
  for (const item of items) {
    if (!item || !item.id || !item.type || !item.path) continue;
    if (typeof item.viewedAt !== "number" || item.viewedAt < cutoff) continue;
    const k = keyOf(item.id, item.type);
    const existing = byKey.get(k);
    if (!existing || item.viewedAt > existing.viewedAt) {
      byKey.set(k, item);
    }
  }
  return Array.from(byKey.values())
    .sort((a, b) => b.viewedAt - a.viewedAt)
    .slice(0, RECENTLY_VIEWED_CAP);
}

function readFromStorage(): RecentlyViewedEntry[] {
  const raw = storage.get<RecentlyViewedShape>(RECENTLY_VIEWED_KEY);
  if (raw && Array.isArray(raw.items)) {
    return normalize(raw.items);
  }
  return [];
}

function persist(items: RecentlyViewedEntry[]): void {
  storage.set<RecentlyViewedShape>(RECENTLY_VIEWED_KEY, { version: 1, items });
}

// Cached snapshot: getSnapshot must return a stable reference between mutations
// or useSyncExternalStore loops. We only replace `current` on an actual change.
let current: RecentlyViewedEntry[] = readFromStorage();
const listeners = new Set<() => void>();

function emit(next: RecentlyViewedEntry[]): void {
  current = next;
  persist(next);
  listeners.forEach((listener) => listener());
}

export function subscribeRecentlyViewed(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRecentlyViewedSnapshot(): RecentlyViewedEntry[] {
  return current;
}

/** Record (or refresh) a viewed item, moving it to the front. */
export function recordView(entry: Omit<RecentlyViewedEntry, "viewedAt">): void {
  try {
    const withTime: RecentlyViewedEntry = { ...entry, viewedAt: Date.now() };
    emit(normalize([withTime, ...current]));
  } catch (error) {
    logger.warn("recordView", "failed to record view", { error: String(error) });
  }
}

export function removeRecentlyViewed(id: string, type?: RecentlyViewedType): void {
  const next = current.filter((item) =>
    type ? !(item.id === id && item.type === type) : item.id !== id,
  );
  if (next.length !== current.length) emit(next);
}

export function clearRecentlyViewed(): void {
  storage.remove(RECENTLY_VIEWED_KEY);
  if (current.length > 0) emit([]);
}

/**
 * Merge server-side history into the local store (called once on sign-in for
 * cross-device continuity). Newer-of-the-two wins per id+type; capped/pruned.
 */
export function mergeServerEntries(entries: RecentlyViewedEntry[]): void {
  if (!entries.length) return;
  emit(normalize([...entries, ...current]));
}

/** Per-type counts — a synchronous engagement signal for home ordering. */
export function getRecentTypeCounts(): Record<RecentlyViewedType, number> {
  const counts: Record<RecentlyViewedType, number> = {
    event: 0,
    restaurant: 0,
    attraction: 0,
  };
  for (const item of current) counts[item.type] += 1;
  return counts;
}

/**
 * The most-viewed content type, or null when there's no history. Tie-break by
 * the canonical type order (event → restaurant → attraction) so it's stable.
 */
export function dominantRecentType(
  items: RecentlyViewedEntry[],
): RecentlyViewedType | null {
  const counts: Record<RecentlyViewedType, number> = {
    event: 0,
    restaurant: 0,
    attraction: 0,
  };
  for (const item of items) counts[item.type] += 1;
  const order: RecentlyViewedType[] = ["event", "restaurant", "attraction"];
  let best: RecentlyViewedType | null = null;
  let bestCount = 0;
  for (const t of order) {
    if (counts[t] > bestCount) {
      best = t;
      bestCount = counts[t];
    }
  }
  return best;
}
