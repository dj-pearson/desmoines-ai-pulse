import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  NEAR_ME_ORIGINS,
  eventStartsInWindow,
  findNearMeOrigin,
  formatNearMeDistance,
  nearMeWindowBounds,
  parseNearMeWindow,
  roundCoordinate,
} from "@/lib/nearMeOrigins";

/**
 * Events plan WP6: near-me origins, windows, rounding, distance copy, and the
 * useEventsNearby query (rounded coordinates, visibility filter, limit flag).
 */

const rpc = vi.fn();
const filterVisibleIds = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock("@/lib/eventQuery", () => ({
  filterVisibleIds: (ids: string[]) => filterVisibleIds(ids),
}));

describe("nearMeOrigins helpers", () => {
  it("has unique slugs and finds them", () => {
    const slugs = NEAR_ME_ORIGINS.map((o) => o.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(findNearMeOrigin("ankeny")?.label).toBe("Ankeny");
    expect(findNearMeOrigin("nowhere")).toBeUndefined();
    expect(findNearMeOrigin(null)).toBeUndefined();
  });

  it("rounds coordinates to 2 decimals", () => {
    expect(roundCoordinate(41.58679)).toBe(41.59);
    expect(roundCoordinate(-93.62512)).toBe(-93.63);
  });

  it("parses ?when= with a next-7-days default", () => {
    expect(parseNearMeWindow("tonight")).toBe("tonight");
    expect(parseNearMeWindow(null)).toBe("next-7-days");
    expect(parseNearMeWindow("bogus")).toBe("next-7-days");
  });

  it("uses Central days for windows", () => {
    // Thu 2026-09-24 9pm CDT.
    const now = new Date("2026-09-25T02:00:00Z");
    expect(nearMeWindowBounds("tonight", now)?.startDay).toBe("2026-09-24");
    const weekend = nearMeWindowBounds("this-weekend", now);
    expect(weekend?.startDay).toBe("2026-09-25");
    expect(weekend?.endDay).toBe("2026-09-27");
    expect(nearMeWindowBounds("anytime", now)).toBeNull();
  });

  it("checks an event start against a window", () => {
    const w = { start: "2026-09-24T05:00:00.000Z", end: "2026-09-25T04:59:59.999Z" };
    expect(eventStartsInWindow({ event_start_utc: "2026-09-25T00:30:00Z" }, w)).toBe(true);
    expect(eventStartsInWindow({ event_start_utc: "2026-09-25T06:00:00Z" }, w)).toBe(false);
    expect(eventStartsInWindow({ date: "2026-09-24T18:00:00Z" }, w)).toBe(true);
    expect(eventStartsInWindow({}, w)).toBe(false);
    expect(eventStartsInWindow({}, null)).toBe(true);
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
    filterVisibleIds.mockReset();
  });

  function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  it("sends rounded coordinates, drops hidden rows, filters by category and window", async () => {
    const { useEventsNearby, NEARBY_EVENTS_LIMIT } = await import("@/hooks/useProximitySearch");
    rpc.mockResolvedValue({
      data: [
        { id: "a", title: "A", category: "Music", event_start_utc: "2026-09-25T00:00:00Z", distance_meters: 0 },
        { id: "hidden", title: "H", category: "Music", event_start_utc: "2026-09-25T00:00:00Z", distance_meters: 10 },
        { id: "b", title: "B", category: "Sports", event_start_utc: "2026-09-25T00:00:00Z", distance_meters: 20 },
        { id: "c", title: "C", category: "Music", event_start_utc: "2026-10-30T00:00:00Z", distance_meters: 30 },
      ],
      error: null,
    });
    filterVisibleIds.mockResolvedValue(new Set(["a", "b", "c"]));

    const { result } = renderHook(
      () =>
        useEventsNearby({
          latitude: 41.58679,
          longitude: -93.62512,
          radiusMiles: 10,
          category: "Music",
          window: { start: "2026-09-24T05:00:00.000Z", end: "2026-09-25T04:59:59.999Z" },
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isFetched).toBe(true));
    expect(rpc).toHaveBeenCalledWith("search_events_near_location", {
      user_lat: 41.59,
      user_lon: -93.63,
      radius_meters: 16093,
      search_limit: NEARBY_EVENTS_LIMIT,
    });
    expect(result.current.items.map((e) => e.id)).toEqual(["a"]);
    expect(result.current.items[0].distance_miles).toBe(0);
    expect(result.current.limitHit).toBe(false);
  });

  it("flags a full LIMIT", async () => {
    const { useEventsNearby, NEARBY_EVENTS_LIMIT } = await import("@/hooks/useProximitySearch");
    const rows = Array.from({ length: NEARBY_EVENTS_LIMIT }, (_, i) => ({
      id: `e${i}`,
      title: `E${i}`,
      distance_meters: i,
    }));
    rpc.mockResolvedValue({ data: rows, error: null });
    filterVisibleIds.mockResolvedValue(new Set(rows.map((r) => r.id)));

    const { result } = renderHook(
      () => useEventsNearby({ latitude: 41.6, longitude: -93.6, window: null }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isFetched).toBe(true));
    expect(result.current.limitHit).toBe(true);
    expect(result.current.items).toHaveLength(NEARBY_EVENTS_LIMIT);
  });
});
