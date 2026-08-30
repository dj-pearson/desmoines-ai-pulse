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
  type RecentlyViewedEntry,
} from "@/lib/recentlyViewed";

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
