import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  DEFAULT_NEAR_ME_RADIUS,
  NEAR_ME_ORIGINS,
  NEAR_ME_WINDOWS,
  findNearMeOrigin,
  formatNearMeDistance,
  nearMeBox,
  nearMeWindowBounds,
  parseNearMeRadius,
  parseNearMeWindow,
  roundCoordinate,
} from "@/lib/nearMeOrigins";
import { SUBURBS } from "@/lib/suburbs";
import { calculateDistance } from "@/hooks/useProximitySearch";

/**
 * events-pass2 WP5: near-me origins, windows, radius, the lat/lng box, and
 * useEventsNearby's two paths (the exact windowed read, and the Anytime RPC).
 */

type Call = [string, unknown[]];

const rpc = vi.fn();
/** Rows the fake `from("events")` answers with, and every call it saw. */
let tableRows: unknown[] = [];
let tableCalls: Call[][] = [];

function fakeBuilder() {
  const calls: Call[] = [];
  tableCalls.push(calls);
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "neq", "is", "not", "ilike", "gte", "lte", "eq", "or", "in", "order", "limit", "textSearch"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve({ data: tableRows, error: null }).then(resolve, reject);
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: () => fakeBuilder(),
  },
}));

describe("nearMeOrigins helpers", () => {
  it("has unique slugs, and an origin for every suburb page", () => {
    const slugs = NEAR_ME_ORIGINS.map((o) => o.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(findNearMeOrigin("ankeny")?.label).toBe("Ankeny");
    expect(findNearMeOrigin("waukee")?.label).toBe("Waukee");
    expect(findNearMeOrigin("nowhere")).toBeUndefined();
    expect(findNearMeOrigin(null)).toBeUndefined();
    // Each suburb page links /events/near-me?from=<slug>.
    for (const slug of Object.keys(SUBURBS)) expect(findNearMeOrigin(slug), slug).toBeDefined();
  });

  it("rounds coordinates to 2 decimals", () => {
    expect(roundCoordinate(41.58679)).toBe(41.59);
    expect(roundCoordinate(-93.62512)).toBe(-93.63);
  });

  it("parses ?when=, keeps old 'tonight' links, and takes the hub's presets", () => {
    expect(NEAR_ME_WINDOWS.map((w) => w.label)).toEqual(["Today", "This weekend", "Next 7 days", "Anytime"]);
    expect(parseNearMeWindow("today")).toBe("today");
    expect(parseNearMeWindow("tonight")).toBe("today");
    expect(parseNearMeWindow("tomorrow")).toBe("tomorrow");
    expect(parseNearMeWindow("next-week")).toBe("next-week");
    expect(parseNearMeWindow(null)).toBe("next-7-days");
    expect(parseNearMeWindow("bogus")).toBe("next-7-days");
  });

  it("uses Central days for windows", () => {
    // Thu 2026-09-24 9pm CDT.
    const now = new Date("2026-09-25T02:00:00Z");
    expect(nearMeWindowBounds("today", now)?.startDay).toBe("2026-09-24");
    const weekend = nearMeWindowBounds("this-weekend", now);
    expect(weekend?.startDay).toBe("2026-09-25");
    expect(weekend?.endDay).toBe("2026-09-27");
    expect(nearMeWindowBounds("anytime", now)).toBeNull();
  });

  it("parses ?r= into whole miles inside 1-50", () => {
    expect(parseNearMeRadius(null)).toBe(DEFAULT_NEAR_ME_RADIUS);
    expect(parseNearMeRadius("10")).toBe(10);
    expect(parseNearMeRadius("0")).toBe(1);
    expect(parseNearMeRadius("900")).toBe(50);
    expect(parseNearMeRadius("abc")).toBe(DEFAULT_NEAR_ME_RADIUS);
  });

  it("the box holds the whole circle", () => {
    const center = { latitude: 41.73, longitude: -93.6 };
    const box = nearMeBox(center, 25);
    // Due north, south, east and west at 25 mi are all inside.
    expect(calculateDistance(center.latitude, center.longitude, box.north, center.longitude)).toBeGreaterThanOrEqual(25);
    expect(calculateDistance(center.latitude, center.longitude, center.latitude, box.east)).toBeGreaterThanOrEqual(25);
    expect(box.south).toBeLessThan(center.latitude);
    expect(box.west).toBeLessThan(center.longitude);
  });

  it("formats distance from an origin, and treats zero as a distance", () => {
    expect(formatNearMeDistance(1.23, "Ankeny")).toBe("1.2 mi from Ankeny");
    expect(formatNearMeDistance(4, undefined)).toBe("4.0 mi away");
    expect(formatNearMeDistance(0, "Downtown")).toBe("Under 0.1 mi from Downtown");
    expect(formatNearMeDistance(undefined, "Downtown")).toBe("");
  });
});

describe("useEventsNearby", () => {
  beforeEach(() => {
    rpc.mockReset();
    tableRows = [];
    tableCalls = [];
  });

  function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  const ANKENY = findNearMeOrigin("ankeny")!;

  it("with a window: one table read, window before the cap, no RPC", async () => {
    const { useEventsNearby, NEARBY_WINDOW_CAP } = await import("@/hooks/useProximitySearch");
    const window = nearMeWindowBounds("next-7-days", new Date("2026-09-25T02:00:00Z"))!;
    // The server answers with in-window rows only. With the RPC, 300 nearer
    // rows on later dates filled its LIMIT and these never arrived.
    tableRows = [
      { id: "far", title: "Far", date: "2026-09-26T00:00:00Z", latitude: 41.9, longitude: -93.6 },
      { id: "near", title: "Near", date: "2026-09-27T00:00:00Z", latitude: 41.73, longitude: -93.6 },
      { id: "mid", title: "Mid", date: "2026-09-25T18:00:00Z", latitude: 41.8, longitude: -93.6 },
      // Inside the box's corner, outside the 25 mi circle.
      { id: "corner", title: "Corner", date: "2026-09-26T00:00:00Z", latitude: 42.08, longitude: -93.13 },
    ];

    const { result } = renderHook(
      () => useEventsNearby({ latitude: ANKENY.latitude, longitude: ANKENY.longitude, radiusMiles: 25, window }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isFetched).toBe(true));

    expect(rpc).not.toHaveBeenCalled();
    expect(result.current.items.map((e) => e.id)).toEqual(["near", "mid", "far"]);
    expect(result.current.items[0].distance_meters).toBe(0);
    expect(result.current.limitHit).toBe(false);
    expect(result.current.source).toBe("window");

    const calls = tableCalls[0];
    const names = calls.map(([m]) => m);
    // Visibility, the window's end, the box and latitude-not-null all precede the cap.
    expect(calls).toContainEqual(["neq", ["is_merged", true]]);
    expect(calls).toContainEqual(["neq", ["is_hidden", true]]);
    expect(calls).toContainEqual(["is", ["archived_at", null]]);
    expect(calls).toContainEqual(["lte", ["date", window.end]]);
    expect(calls).toContainEqual(["not", ["latitude", "is", null]]);
    const box = nearMeBox({ latitude: 41.73, longitude: -93.6 }, 25);
    expect(calls).toContainEqual(["gte", ["latitude", box.south]]);
    expect(calls).toContainEqual(["lte", ["longitude", box.east]]);
    const or = calls.find(([m]) => m === "or");
    expect(String(or?.[1][0])).toContain(`date.gte."${window.start}"`);
    expect(calls).toContainEqual(["limit", [NEARBY_WINDOW_CAP]]);
    expect(names.indexOf("limit")).toBe(names.length - 1);
  });

  it("with a window and a category, the category is in the query", async () => {
    const { useEventsNearby } = await import("@/hooks/useProximitySearch");
    const window = nearMeWindowBounds("this-weekend", new Date("2026-09-25T02:00:00Z"))!;
    const { result } = renderHook(
      () => useEventsNearby({ latitude: 41.6, longitude: -93.6, category: "Music", window }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isFetched).toBe(true));
    expect(tableCalls[0]).toContainEqual(["eq", ["category", "Music"]]);
  });

  it("Anytime: rounded RPC, visible rows read by id, category, capped flag", async () => {
    const { useEventsNearby, NEARBY_EVENTS_LIMIT } = await import("@/hooks/useProximitySearch");
    rpc.mockResolvedValue({
      data: [
        { id: "a", distance_meters: 0 },
        { id: "hidden", distance_meters: 10 },
        { id: "b", distance_meters: 20 },
      ],
      error: null,
    });
    // The id read applies visibility, so "hidden" does not come back.
    tableRows = [
      { id: "b", title: "B", category: "Sports", date: "2099-01-01T00:00:00Z" },
      { id: "a", title: "A", category: "Music", date: "2099-01-01T00:00:00Z" },
    ];

    const { result } = renderHook(
      () =>
        useEventsNearby({ latitude: 41.58679, longitude: -93.62512, radiusMiles: 10, category: "Music", window: null }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isFetched).toBe(true));
    expect(rpc).toHaveBeenCalledWith("search_events_near_location", {
      user_lat: 41.59,
      user_lon: -93.63,
      radius_meters: 16093,
      search_limit: NEARBY_EVENTS_LIMIT,
    });
    expect(tableCalls[0]).toContainEqual(["in", ["id", ["a", "hidden", "b"]]]);
    expect(tableCalls[0]).toContainEqual(["neq", ["is_hidden", true]]);
    expect(result.current.items.map((e) => e.id)).toEqual(["a"]);
    expect(result.current.items[0].distance_miles).toBe(0);
    expect(result.current.limitHit).toBe(false);
    expect(result.current.source).toBe("rpc");
  });

  it("Anytime flags a full LIMIT", async () => {
    const { useEventsNearby, NEARBY_EVENTS_LIMIT } = await import("@/hooks/useProximitySearch");
    const ids = Array.from({ length: NEARBY_EVENTS_LIMIT }, (_, i) => `e${i}`);
    rpc.mockResolvedValue({ data: ids.map((id, i) => ({ id, distance_meters: i })), error: null });
    tableRows = ids.map((id) => ({ id, title: id, date: "2099-01-01T00:00:00Z" }));

    const { result } = renderHook(
      () => useEventsNearby({ latitude: 41.6, longitude: -93.6, window: null }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isFetched).toBe(true));
    expect(result.current.limitHit).toBe(true);
    // 200 ids are two chunks of the id read, sent together.
    expect(tableCalls).toHaveLength(2);
  });
});
