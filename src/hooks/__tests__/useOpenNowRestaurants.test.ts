import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromZonedTime } from "date-fns-tz";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  applyOpenNowFilters,
  clockLabelToMinutes,
  cuisineValues,
  deriveOpenNow,
  facetCounts,
  isListableRow,
  orderByDistance,
  pastMidnightInstant,
  resolveOpenAt,
  type OpenNowRestaurantRow,
} from "@/hooks/useOpenNowRestaurants";
import { dietFromParam } from "@/hooks/useDietaryRestaurants";
import { dishSearchTerm, keepAllowedDishes, type DishMatch } from "@/hooks/useDishSearch";
import { findEventArea } from "@/lib/eventAreas";

/**
 * The open-now derivation (eat-drink plan WP5). Runs with the process zone at
 * Los Angeles, so anything reading the browser zone instead of Central fails.
 */
function central(local: string): Date {
  return fromZonedTime(local, "America/Chicago");
}

function row(id: string, opening: string | null, extra: Partial<OpenNowRestaurantRow> = {}): OpenNowRestaurantRow {
  return { id, name: id, opening, status: "active", is_merged: false, ...extra };
}

const ROWS: OpenNowRestaurantRow[] = [
  row("Late Bar", "Daily 4pm-2am"),
  row("Dinner Place", "Daily 11am-10pm"),
  row("Lunch Only", "Daily 11am-2pm"),
  row("Closes Soon", "Daily 7am-9:45pm"),
  row("Merged Twin", "Daily 11am-10pm", { is_merged: true }),
  row("Gone", "Daily 11am-10pm", { status: "closed" }),
  row("No Hours", null),
];

describe("useOpenNowRestaurants derivation", () => {
  const original = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/Los_Angeles";
  });
  afterAll(() => {
    process.env.TZ = original;
  });

  it("drops merged, closed and hour-less rows", () => {
    expect(ROWS.filter(isListableRow).map((r) => r.id)).toEqual([
      "Late Bar",
      "Dinner Place",
      "Lunch Only",
      "Closes Soon",
    ]);
  });

  it("reads clock labels back to minutes", () => {
    expect(clockLabelToMinutes("10 PM")).toBe(22 * 60);
    expect(clockLabelToMinutes("9:45 PM")).toBe(21 * 60 + 45);
    expect(clockLabelToMinutes("12 AM")).toBe(0);
    expect(clockLabelToMinutes("midnight")).toBe(0);
    expect(clockLabelToMinutes("noon")).toBe(720);
    expect(clockLabelToMinutes("soon")).toBeNull();
  });

  it("sorts open places by time left and splits off closing-within-the-hour", () => {
    const view = deriveOpenNow(ROWS, central("2026-09-24T21:00:00"));
    expect(view.open.map((e) => e.restaurant.id)).toEqual(["Late Bar"]);
    expect(view.closingSoon.map((e) => e.restaurant.id)).toEqual(["Dinner Place", "Closes Soon"]);
    expect(view.withListedHours).toBe(4);
  });

  it("uses Central time, not the browser zone", () => {
    // 21:30 in Los Angeles is 23:30 in Des Moines: the 10 PM place is closed.
    const view = deriveOpenNow(ROWS, new Date("2026-09-25T04:30:00Z"));
    const openIds = [...view.open, ...view.closingSoon].map((e) => e.restaurant.id);
    expect(openIds).toEqual(["Late Bar"]);
  });

  it("lists the next to open when nothing is", () => {
    const view = deriveOpenNow(ROWS, central("2026-09-25T03:00:00"));
    expect(view.open).toHaveLength(0);
    expect(view.closingSoon).toHaveLength(0);
    expect(view.nextToOpen[0].restaurant.id).toBe("Closes Soon");
    expect(view.nextToOpen[0].status.nextOpensAt).toBe("7 AM");
  });

  it("finds places open past midnight tonight", () => {
    expect(pastMidnightInstant(central("2026-09-24T20:00:00")).toISOString()).toBe(
      central("2026-09-25T00:30:00").toISOString(),
    );
    expect(pastMidnightInstant(central("2026-09-25T01:00:00")).toISOString()).toBe(
      central("2026-09-25T00:30:00").toISOString(),
    );
    const view = deriveOpenNow(ROWS, central("2026-09-24T20:00:00"));
    expect(view.openPastMidnight.map((e) => e.restaurant.id)).toEqual(["Late Bar"]);
  });

  // Pass 2 WP4.6: at 1 AM, "tonight's 00:30" has gone.
  it("lists nothing past midnight once midnight has passed", () => {
    const view = deriveOpenNow(ROWS, central("2026-09-25T01:00:00"));
    expect(view.openPastMidnight).toEqual([]);
  });

  // Pass 2 WP4.2: the denominator is what the evaluator can read.
  it("counts readable hours and lists the unreadable ones", () => {
    const rows = [...ROWS, row("Mystery", "Call for hours"), row("Also Mystery", "See website")];
    const view = deriveOpenNow(rows, central("2026-09-24T21:00:00"));
    expect(view.withListedHours).toBe(6);
    expect(view.withReadableHours).toBe(4);
    expect(view.unreadable.map((r) => r.id)).toEqual(["Also Mystery", "Mystery"]);
  });

  it("drops places with less than an hour left when asked", () => {
    // 21:00: Dinner Place has exactly 60 minutes, Closes Soon 45.
    const view = deriveOpenNow(ROWS, central("2026-09-24T21:00:00"), 5, 60);
    expect(view.open.map((e) => e.restaurant.id)).toEqual(["Late Bar"]);
    expect(view.closingSoon.map((e) => e.restaurant.id)).toEqual(["Dinner Place"]);
  });
});

describe("resolveOpenAt (pass 2 WP4.4)", () => {
  it("is null for now and for junk", () => {
    const now = central("2026-09-25T18:00:00");
    expect(resolveOpenAt(null, now)).toBeNull();
    expect(resolveOpenAt("", now)).toBeNull();
    expect(resolveOpenAt("25:00", now)).toBeNull();
    expect(resolveOpenAt("tonight", now)).toBeNull();
  });

  it("reads 10 PM tonight in Central time", () => {
    const at = resolveOpenAt("22:00", central("2026-09-25T18:00:00"));
    expect(at?.instant.toISOString()).toBe(central("2026-09-25T22:00:00").toISOString());
    expect(at?.clock).toBe("10 PM");
    expect(at?.when).toBe("tonight");
  });

  it("puts midnight at the start of tomorrow", () => {
    const at = resolveOpenAt("00:00", central("2026-09-25T20:00:00"));
    expect(at?.instant.toISOString()).toBe(central("2026-09-26T00:00:00").toISOString());
    expect(at?.clock).toBe("midnight");
    expect(at?.when).toBe("tonight");
  });

  it("moves a time already past to the next night and names it", () => {
    const at = resolveOpenAt("22:00", central("2026-09-25T23:30:00"));
    expect(at?.instant.toISOString()).toBe(central("2026-09-26T22:00:00").toISOString());
    expect(at?.when).toBe("Sat");
  });

  it("evaluates the open list at the chosen time", () => {
    const at = resolveOpenAt("22:00", central("2026-09-25T12:00:00"));
    const view = deriveOpenNow(ROWS, at!.instant);
    const ids = [...view.open, ...view.closingSoon].map((e) => e.restaurant.id);
    expect(ids).toEqual(["Late Bar"]);
  });
});

describe("open-now filters (pass 2 WP4.4)", () => {
  const rows: OpenNowRestaurantRow[] = [
    row("Taqueria", "Daily 11am-11pm", { cuisine: "Mexican, Tex-Mex", city: "Des Moines", latitude: 41.59, longitude: -93.61 }),
    row("Burrito Bar", "Daily 11am-11pm", { cuisine: "Mexican", city: "Ankeny" }),
    row("Green Plate", "Daily 11am-9pm", { cuisine: "Cafe", description: "Vegan and gluten-free bowls", city: "Des Moines" }),
    row("Steak House", "Daily 4pm-10pm", { cuisine: "Steakhouse", city: "West Des Moines" }),
  ];

  it("splits cuisine values and counts them for chips", () => {
    expect(cuisineValues(rows[0])).toEqual(["Mexican", "Tex-Mex"]);
    expect(facetCounts(rows, cuisineValues)[0]).toEqual({ value: "Mexican", count: 2 });
  });

  it("matches a whole cuisine value, case aside", () => {
    expect(applyOpenNowFilters(rows, { cuisine: "mexican" }).map((r) => r.id)).toEqual(["Taqueria", "Burrito Bar"]);
    expect(applyOpenNowFilters(rows, { cuisine: "Mex" })).toEqual([]);
  });

  it("filters by city, area and diet together", () => {
    expect(applyOpenNowFilters(rows, { city: "des moines" }).map((r) => r.id)).toEqual(["Taqueria", "Green Plate"]);
    expect(applyOpenNowFilters(rows, { area: findEventArea("east-village") }).map((r) => r.id)).toEqual(["Taqueria"]);
    expect(applyOpenNowFilters(rows, { diet: dietFromParam("vegan"), city: "Des Moines" }).map((r) => r.id)).toEqual([
      "Green Plate",
    ]);
  });

  it("orders near me by distance, rows without coordinates last", () => {
    const now = central("2026-09-25T19:00:00");
    const view = deriveOpenNow(
      [
        row("Far", "Daily 11am-11pm", { latitude: 41.7, longitude: -93.6 }),
        row("Nowhere", "Daily 11am-11pm"),
        row("Near", "Daily 11am-10pm", { latitude: 41.586, longitude: -93.62 }),
      ],
      now,
    );
    const ordered = orderByDistance(view.open, { latitude: 41.5868, longitude: -93.625 }, now);
    expect(ordered.map((e) => e.restaurant.id)).toEqual(["Near", "Far", "Nowhere"]);
  });
});

describe("dish search helpers (pass 2 WP4.5)", () => {
  it("needs three characters", () => {
    expect(dishSearchTerm("ph")).toBeNull();
    expect(dishSearchTerm("  pho  ")).toBe("pho");
  });

  it("keeps only rows for loaded restaurants, once per item", () => {
    const m = (item: string, restaurant: string): DishMatch => ({
      item_id: item,
      restaurant_id: restaurant,
      restaurant_name: restaurant,
      restaurant_slug: null,
      item_name: "Pho tai",
      price: "13",
    });
    const kept = keepAllowedDishes([m("1", "open"), m("2", "merged"), m("1", "open")], new Set(["open"]));
    expect(kept.map((d) => d.item_id)).toEqual(["1"]);
  });
});
