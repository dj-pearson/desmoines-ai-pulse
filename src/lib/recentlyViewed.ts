import { storage } from "@/lib/safeStorage";

/**
 * Unified recently-viewed store (WEB-FEAT-007).
 *
 * One list across content types (events, restaurants, attractions) so the
 * homepage "Recently viewed" rail and the dashboard list can resume any item.
 * The guest store lives in safeStorage; signed-in users additionally sync to a
 * server table (see useRecentlyViewed / the recently_viewed migration) — this
 * module is the local source of truth and pure enough to unit-test.
 *
 * Invariants: newest first, deduped by (type,id), capped at MAX_ITEMS, and
 * pruned of anything older than MAX_AGE_MS on every read/write.
 */
export type RecentlyViewedType = "event" | "restaurant" | "attraction";

export interface RecentlyViewedEntry {
  id: string;
  type: RecentlyViewedType;
  title: string;
  /** Route path to resume the item, e.g. "/events/<slug>". */
  href: string;
  image_url?: string;
  /** Short context line (date, cuisine, attraction type…). */
  subtitle?: string;
  viewedAt: number;
}

export const RECENTLY_VIEWED_KEY = "dmi_recently_viewed_v1";
export const MAX_ITEMS = 20;
export const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sameItem(a: { id: string; type: RecentlyViewedType }, b: { id: string; type: RecentlyViewedType }) {
  return a.id === b.id && a.type === b.type;
}

/** Sort newest-first, drop entries older than MAX_AGE_MS, cap to MAX_ITEMS. */
export function normalizeEntries(
  entries: RecentlyViewedEntry[],
  now: number = Date.now(),
): RecentlyViewedEntry[] {
  const cutoff = now - MAX_AGE_MS;
  return entries
    .filter((e) => e && typeof e.id === "string" && typeof e.viewedAt === "number" && e.viewedAt >= cutoff)
    .sort((a, b) => b.viewedAt - a.viewedAt)
    .slice(0, MAX_ITEMS);
}

export function readRecentlyViewed(now: number = Date.now()): RecentlyViewedEntry[] {
  const raw = storage.get<RecentlyViewedEntry[]>(RECENTLY_VIEWED_KEY) ?? [];
  if (!Array.isArray(raw)) return [];
  const normalized = normalizeEntries(raw, now);
  // Persist the pruned list so stale entries don't linger across sessions.
  if (normalized.length !== raw.length) storage.set(RECENTLY_VIEWED_KEY, normalized);
  return normalized;
}

/** Record a view: move/insert at the front, dedupe, prune, cap. Returns the new list. */
export function recordView(
  entry: Omit<RecentlyViewedEntry, "viewedAt"> & { viewedAt?: number },
  now: number = Date.now(),
): RecentlyViewedEntry[] {
  const viewedAt = entry.viewedAt ?? now;
  const next: RecentlyViewedEntry = { ...entry, viewedAt };
  const existing = storage.get<RecentlyViewedEntry[]>(RECENTLY_VIEWED_KEY) ?? [];
  const deduped = (Array.isArray(existing) ? existing : []).filter((e) => !sameItem(e, next));
  const updated = normalizeEntries([next, ...deduped], now);
  storage.set(RECENTLY_VIEWED_KEY, updated);
  return updated;
}

export function removeView(id: string, type: RecentlyViewedType): RecentlyViewedEntry[] {
  const existing = storage.get<RecentlyViewedEntry[]>(RECENTLY_VIEWED_KEY) ?? [];
  const updated = (Array.isArray(existing) ? existing : []).filter((e) => !sameItem(e, { id, type }));
  storage.set(RECENTLY_VIEWED_KEY, updated);
  return updated;
}

export function clearRecentlyViewed(): void {
  storage.remove(RECENTLY_VIEWED_KEY);
}

/** Count entries per type — the engagement signal for home section ordering. */
export function engagementByType(entries: RecentlyViewedEntry[]): Record<RecentlyViewedType, number> {
  const counts: Record<RecentlyViewedType, number> = { event: 0, restaurant: 0, attraction: 0 };
  for (const e of entries) {
    if (e.type in counts) counts[e.type] += 1;
  }
  return counts;
}
