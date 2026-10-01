import { describe, it, expect, beforeEach } from "vitest";
import {
  recordView,
  readRecentlyViewed,
  removeView,
  clearRecentlyViewed,
  engagementByType,
  normalizeEntries,
  MAX_ITEMS,
  MAX_AGE_MS,
  LEGACY_EVENTS_KEY,
  LEGACY_RESTAURANTS_KEY,
  legacyEventToEntry,
  mergeEntries,
  type RecentlyViewedEntry,
} from "@/lib/recentlyViewed";
import { storage } from "@/lib/safeStorage";

/** WEB-FEAT-007 — unified recently-viewed store (guest path). */
const base = (id: string, type: RecentlyViewedEntry["type"], viewedAt: number): Omit<RecentlyViewedEntry, "viewedAt"> & { viewedAt: number } => ({
  id,
  type,
  title: `${type}-${id}`,
  href: `/${type}s/${id}`,
  viewedAt,
});

describe("recentlyViewed store", () => {
  beforeEach(() => clearRecentlyViewed());

  it("records newest-first and dedupes by (type,id), refreshing the timestamp", () => {
    const t0 = 1_000_000;
    recordView(base("a", "event", t0), t0);
    recordView(base("b", "restaurant", t0 + 1), t0 + 1);
    const after = recordView(base("a", "event", t0 + 2), t0 + 2); // re-view a

    expect(after.map((e) => `${e.type}:${e.id}`)).toEqual(["event:a", "restaurant:b"]);
    expect(after[0].viewedAt).toBe(t0 + 2);
  });

  it("treats same id of different types as distinct entries", () => {
    const t = 2_000_000;
    recordView(base("x", "event", t), t);
    const after = recordView(base("x", "restaurant", t + 1), t + 1);
    expect(after).toHaveLength(2);
  });

  it("caps at MAX_ITEMS", () => {
    let t = 5_000_000;
    for (let i = 0; i < MAX_ITEMS + 5; i++) recordView(base(`e${i}`, "event", ++t), t);
    expect(readRecentlyViewed(t)).toHaveLength(MAX_ITEMS);
  });

  it("prunes entries older than 30 days on read", () => {
    const now = 100 * MAX_AGE_MS;
    recordView(base("old", "event", now - MAX_AGE_MS - 1000), now - MAX_AGE_MS - 1000);
    recordView(base("new", "event", now - 1000), now - 1000);
    const list = readRecentlyViewed(now);
    expect(list.map((e) => e.id)).toEqual(["new"]);
  });

  it("removeView removes only the matching (type,id)", () => {
    const t = 7_000_000;
    recordView(base("a", "event", t), t);
    recordView(base("a", "restaurant", t + 1), t + 1);
    const after = removeView("a", "event");
    expect(after.map((e) => `${e.type}:${e.id}`)).toEqual(["restaurant:a"]);
  });

  it("engagementByType counts per type", () => {
    const t = 8_000_000;
    const entries: RecentlyViewedEntry[] = [
      { ...base("1", "restaurant", t), viewedAt: t },
      { ...base("2", "restaurant", t), viewedAt: t },
      { ...base("3", "event", t), viewedAt: t },
    ];
    expect(engagementByType(entries)).toEqual({ event: 1, restaurant: 2, attraction: 0 });
  });

  it("normalizeEntries drops malformed rows", () => {
    const t = 9_000_000;
    const dirty = [
      { ...base("ok", "event", t), viewedAt: t },
      { id: 5, type: "event", viewedAt: t },
      { id: "no-ts", type: "event" },
    ] as unknown as RecentlyViewedEntry[];
    expect(normalizeEntries(dirty, t).map((e) => e.id)).toEqual(["ok"]);
  });
});

describe("legacy key fold (Home plan WP2 item 5)", () => {
  beforeEach(() => {
    clearRecentlyViewed();
    storage.remove(LEGACY_EVENTS_KEY);
    storage.remove(LEGACY_RESTAURANTS_KEY);
  });

  it("moves EventCard's legacy entries into the unified store and deletes the old key", () => {
    const now = 10_000_000;
    storage.set(LEGACY_EVENTS_KEY, [
      { id: "e1", title: "Jazz in July", date: "2026-07-10T23:00:00Z", venue: "Hoyt Sherman", viewedAt: now - 10 },
      { id: 7, title: "broken" },
    ]);
    const entries = readRecentlyViewed(now);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: "e1", type: "event", title: "Jazz in July", subtitle: "Hoyt Sherman" });
    expect(entries[0].href).toBe("/events/jazz-in-july-2026-07-10");
    expect(storage.get(LEGACY_EVENTS_KEY)).toBeNull();
    // Persisted, so the second read does not depend on the legacy key.
    expect(readRecentlyViewed(now).map((e) => e.id)).toEqual(["e1"]);
  });

  it("folds legacy restaurants too, with an id route", () => {
    const now = 11_000_000;
    storage.set(LEGACY_RESTAURANTS_KEY, [{ id: "r1", name: "Zombie Burger", cuisine: "Burgers", viewedAt: now - 5 }]);
    const [entry] = readRecentlyViewed(now);
    expect(entry).toMatchObject({ id: "r1", type: "restaurant", href: "/restaurants/r1", subtitle: "Burgers" });
  });

  it("keeps the newer copy when an item is in both stores", () => {
    const now = 12_000_000;
    recordView(base("e1", "event", now - 100), now - 100);
    storage.set(LEGACY_EVENTS_KEY, [{ id: "e1", title: "Newer", viewedAt: now - 1 }]);
    const entries = readRecentlyViewed(now);
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("Newer");
  });

  it("legacyEventToEntry rejects rows without id, title or timestamp", () => {
    expect(legacyEventToEntry({ title: "x", viewedAt: 1 })).toBeNull();
    expect(legacyEventToEntry({ id: "x", viewedAt: 1 })).toBeNull();
    expect(legacyEventToEntry({ id: "x", title: "x" })).toBeNull();
  });

  it("mergeEntries dedupes by (type,id)", () => {
    const t = 13_000_000;
    const merged = mergeEntries(
      [{ ...base("a", "event", t), viewedAt: t }],
      [{ ...base("a", "event", t - 1), viewedAt: t - 1 }, { ...base("a", "restaurant", t - 2), viewedAt: t - 2 }],
      t,
    );
    expect(merged.map((e) => `${e.type}:${e.id}:${e.viewedAt}`)).toEqual([`event:a:${t}`, `restaurant:a:${t - 2}`]);
  });
});
