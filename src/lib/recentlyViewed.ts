import { storage } from "@/lib/safeStorage";
import { createEventSlugWithCentralTime } from "@/lib/timezone";
import { LEGACY_EVENTS_KEY, LEGACY_RESTAURANTS_KEY, RECENTLY_VIEWED_KEY } from "@/lib/recentlyViewedKeys";

// Re-exported so existing importers keep one entry point. The constants live in
// recentlyViewedKeys.ts, which has no imports, so AuthContext can reach them
// without pulling timezone.ts (and date-fns) into the entry chunk.
export {
  LEGACY_EVENTS_KEY,
  LEGACY_RESTAURANTS_KEY,
  LEGACY_RECENTLY_VIEWED_KEYS,
  RECENTLY_VIEWED_KEY,
} from "@/lib/recentlyViewedKeys";

/**
 * Unified recently-viewed store (WEB-FEAT-007).
 *
 * One list across content types (events, restaurants, attractions) so the
 * homepage "Recently viewed" rail and the dashboard list can resume any item.
 * The guest store lives in safeStorage; signed-in users additionally sync to a
 * server table (see useRecentlyViewedFeed / the recently_viewed migration) — this
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

export const MAX_ITEMS = 20;
export const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface LegacyEventItem {
  id?: unknown;
  title?: unknown;
  image_url?: unknown;
  date?: unknown;
  venue?: unknown;
  location?: unknown;
  category?: unknown;
  viewedAt?: unknown;
}

interface LegacyRestaurantItem {
  id?: unknown;
  name?: unknown;
  image_url?: unknown;
  cuisine?: unknown;
  viewedAt?: unknown;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

/** Convert one legacy event row. Returns null for anything unusable. */
export function legacyEventToEntry(item: LegacyEventItem): RecentlyViewedEntry | null {
  const id = str(item.id);
  const title = str(item.title);
  if (!id || !title || typeof item.viewedAt !== "number") return null;
  return {
    id,
    type: "event",
    title,
    href: `/events/${createEventSlugWithCentralTime(title, { date: str(item.date) })}`,
    image_url: str(item.image_url),
    subtitle: str(item.venue) ?? str(item.location) ?? str(item.category),
    viewedAt: item.viewedAt,
  };
}

/** Convert one legacy restaurant row. The restaurant route resolves an id. */
export function legacyRestaurantToEntry(item: LegacyRestaurantItem): RecentlyViewedEntry | null {
  const id = str(item.id);
  const title = str(item.name);
  if (!id || !title || typeof item.viewedAt !== "number") return null;
  return {
    id,
    type: "restaurant",
    title,
    href: `/restaurants/${id}`,
    image_url: str(item.image_url),
    subtitle: str(item.cuisine),
    viewedAt: item.viewedAt,
  };
}

/**
 * Merge `legacy` into `current`, newest wins on a (type,id) clash. Pure; the
 * storage half lives in readRecentlyViewed.
 */
export function mergeEntries(
  current: RecentlyViewedEntry[],
  legacy: RecentlyViewedEntry[],
  now: number = Date.now(),
): RecentlyViewedEntry[] {
  const byKey = new Map<string, RecentlyViewedEntry>();
  for (const e of [...current, ...legacy]) {
    const key = `${e.type}:${e.id}`;
    const existing = byKey.get(key);
    if (!existing || e.viewedAt > existing.viewedAt) byKey.set(key, e);
  }
  return normalizeEntries([...byKey.values()], now);
}

/** Read and delete the legacy keys. Returns the converted entries. */
function takeLegacyEntries(): RecentlyViewedEntry[] {
  const out: RecentlyViewedEntry[] = [];
  const events = storage.get<unknown>(LEGACY_EVENTS_KEY);
  if (events !== null) {
    if (Array.isArray(events)) {
      for (const item of events) {
        const entry = item && typeof item === "object" ? legacyEventToEntry(item as LegacyEventItem) : null;
        if (entry) out.push(entry);
      }
    }
    storage.remove(LEGACY_EVENTS_KEY);
  }
  const restaurants = storage.get<unknown>(LEGACY_RESTAURANTS_KEY);
  if (restaurants !== null) {
    if (Array.isArray(restaurants)) {
      for (const item of restaurants) {
        const entry =
          item && typeof item === "object" ? legacyRestaurantToEntry(item as LegacyRestaurantItem) : null;
        if (entry) out.push(entry);
      }
    }
    storage.remove(LEGACY_RESTAURANTS_KEY);
  }
  return out;
}

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
  const stored = storage.get<RecentlyViewedEntry[]>(RECENTLY_VIEWED_KEY) ?? [];
  const raw = Array.isArray(stored) ? stored : [];
  const legacy = takeLegacyEntries();
  const normalized = legacy.length > 0 ? mergeEntries(raw, legacy, now) : normalizeEntries(raw, now);
  // Persist the pruned (or folded) list so stale entries don't linger.
  if (legacy.length > 0 || normalized.length !== raw.length) {
    storage.set(RECENTLY_VIEWED_KEY, normalized);
  }
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
