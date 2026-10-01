import { describe, expect, it, vi } from "vitest";
import { fromZonedTime } from "date-fns-tz";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  MAP_PIN_STATUS_COLORS,
  MAP_PIN_STATUS_ORDER,
  mapFilterKey,
  mapPinState,
  splitByCoordinates,
  type RestaurantMapPoint,
} from "@/hooks/useRestaurantMapPoints";

/** Thu 2026-09-24 in Des Moines. */
const at = (wall: string) => fromZonedTime(`2026-09-24T${wall}:00`, "America/Chicago");

const row = (over: Partial<RestaurantMapPoint> = {}): RestaurantMapPoint => ({
  id: "r1",
  name: "Test Bistro",
  slug: "test-bistro",
  latitude: 41.58,
  longitude: -93.62,
  cuisine: "American",
  opening: "Mon-Sun 11am-10pm",
  price_range: "$$",
  rating: 4.2,
  image_url: null,
  phone: null,
  status: "open",
  ...over,
});

describe("splitByCoordinates", () => {
  it("keeps rows without both coordinates out of the map and in the unmapped list", () => {
    const { mapped, unmapped } = splitByCoordinates([
      row({ id: "a" }),
      row({ id: "b", latitude: null }),
      row({ id: "c", longitude: null }),
      row({ id: "d", latitude: Number.NaN }),
    ]);
    expect(mapped.map((r) => r.id)).toEqual(["a"]);
    expect(unmapped.map((r) => r.id)).toEqual(["b", "c", "d"]);
  });

  it("does not treat 0 as missing", () => {
    expect(splitByCoordinates([row({ latitude: 0, longitude: 0 })]).mapped).toHaveLength(1);
  });
});

describe("mapPinState", () => {
  it("reads the hours in Central time", () => {
    expect(mapPinState(row(), at("12:00"))).toEqual({ status: "open", label: "Open until 10 PM" });
    expect(mapPinState(row(), at("21:30")).status).toBe("closing-soon");
    expect(mapPinState(row(), at("23:00")).status).toBe("closed");
  });

  it("lets the listing status override hours that still parse", () => {
    expect(mapPinState(row({ status: "closed" }), at("12:00"))).toEqual({
      status: "closed",
      label: "Permanently closed",
    });
    expect(mapPinState(row({ status: "opening_soon" }), at("12:00")).label).toBe("Not open yet");
    expect(mapPinState(row({ status: "announced" }), at("12:00"))).toEqual({
      status: "closed",
      label: "Not open yet",
    });
  });

  it("says hours unknown rather than guessing", () => {
    expect(mapPinState(row({ opening: null }), at("12:00"))).toEqual({
      status: "unknown",
      label: "Hours unknown",
    });
  });
});

describe("pin colours", () => {
  it("gives each of the four statuses its own colour", () => {
    const colours = MAP_PIN_STATUS_ORDER.map((s) => MAP_PIN_STATUS_COLORS[s]);
    expect(new Set(colours).size).toBe(4);
  });
});

describe("mapFilterKey", () => {
  it("ignores sort and paging so switching them reuses the map query", () => {
    const base = { cuisine: ["Thai", "Italian"], rating: [0, 5] };
    const a = mapFilterKey({ ...base, sortBy: "rating", limit: 30 } as Parameters<typeof mapFilterKey>[0]);
    const b = mapFilterKey({ cuisine: ["Italian", "Thai"], rating: [0, 5] });
    expect(a).toEqual(b);
  });

  it("treats the full rating range as no filter", () => {
    expect(mapFilterKey({ rating: [0, 5] }).rating).toBeNull();
    expect(mapFilterKey({ rating: [4, 5] }).rating).toEqual([4, 5]);
  });

  it("picks dietary selections out of tags", () => {
    expect(mapFilterKey({ tags: ["vegan", "Takeout"] }).dietary).toEqual(["vegan"]);
  });
});
