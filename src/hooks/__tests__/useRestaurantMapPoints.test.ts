import { describe, expect, it, vi } from "vitest";
import { fromZonedTime } from "date-fns-tz";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  MAP_POINT_COLUMNS,
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

  it("labels a Google CLOSED_TEMPORARILY place closed even though its weekly hours still say open (WEB-FEAT-038)", () => {
    const renovating = row({ business_status: "CLOSED_TEMPORARILY" });
    // Same row, same noon: the hours alone would colour it green.
    expect(mapPinState(row(), at("12:00")).status).toBe("open");
    expect(mapPinState(renovating, at("12:00"))).toEqual({ status: "closed", label: "Temporarily closed" });
    expect(mapPinState(row({ business_status: " closed_temporarily " }), at("12:00")).label).toBe(
      "Temporarily closed"
    );
    expect(mapPinState(row({ business_status: "CLOSED_PERMANENTLY" }), at("12:00"))).toEqual({
      status: "closed",
      label: "Permanently closed",
    });
  });

  it("reads OPERATIONAL, missing and unrecognised business_status as no closure", () => {
    for (const business_status of ["OPERATIONAL", null, undefined, "SOMETHING_NEW"]) {
      expect(mapPinState(row({ business_status }), at("12:00"))).toEqual({
        status: "open",
        label: "Open until 10 PM",
      });
    }
  });

  describe("production rows: hours in hours_json, a date in opening (WEB-FEAT-040)", () => {
    // Google's periods: day 0 is Sunday. Every day 11:00-22:00.
    const elevenToTen = {
      periods: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
        open: { day, hour: 11, minute: 0 },
        close: { day, hour: 22, minute: 0 },
      })),
    };
    const prodRow = (over: Partial<RestaurantMapPoint> = {}) =>
      row({ opening: "2019-06-01", hours_json: elevenToTen, ...over });

    it("colours the pin from hours_json", () => {
      expect(mapPinState(prodRow(), at("12:00"))).toEqual({ status: "open", label: "Open until 10 PM" });
      expect(mapPinState(prodRow(), at("21:30")).status).toBe("closing-soon");
      expect(mapPinState(prodRow(), at("23:00")).status).toBe("closed");
    });

    it("is unknown without hours_json, because the date in opening is not hours (negative control)", () => {
      expect(mapPinState(prodRow({ hours_json: null }), at("12:00"))).toEqual({
        status: "unknown",
        label: "Hours unknown",
      });
    });

    it("prefers hours_json over hours text that disagrees", () => {
      const pin = mapPinState(prodRow({ opening: "Mon-Sun 6am-8am" }), at("12:00"));
      expect(pin.status).toBe("open");
    });

    it("still lets status and business_status win over hours_json", () => {
      expect(mapPinState(prodRow({ business_status: "CLOSED_TEMPORARILY" }), at("12:00"))).toEqual({
        status: "closed",
        label: "Temporarily closed",
      });
      expect(mapPinState(prodRow({ status: "closed" }), at("12:00")).label).toBe("Permanently closed");
    });
  });

  it("says hours unknown rather than guessing", () => {
    expect(mapPinState(row({ opening: null }), at("12:00"))).toEqual({
      status: "unknown",
      label: "Hours unknown",
    });
  });
});

describe("MAP_POINT_COLUMNS", () => {
  it("selects business_status and hours_json, which mapPinState reads", () => {
    const columns = MAP_POINT_COLUMNS.split(",").map((c) => c.trim());
    expect(columns).toContain("business_status");
    expect(columns).toContain("hours_json");
    expect(columns).toContain("status");
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
