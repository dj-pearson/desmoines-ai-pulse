import { describe, expect, it } from "vitest";
import { join } from "node:path";
import * as hours from "@/lib/restaurantHours";
import * as status from "@/lib/restaurantStatus";
import { SRC, chain, eagerGraph } from "./support/eagerGraph";

/**
 * WEB-PERF-080. restaurantHours.ts held both the free-text hours parser
 * (with date-fns-tz) and the small status helpers most restaurant pages use
 * to filter rows: NOT_CLOSED_RESTAURANT_FILTER, isVisitableStatus,
 * isPermanentlyClosedRestaurant, DES_MOINES_TIME_ZONE. Pages that wanted only
 * those paid about 3.5 KB gz for the parser. The helpers now live in
 * restaurantStatus.ts, which has no imports.
 *
 * The regression is any static path from these routes back to
 * restaurantHours.ts, or restaurantStatus.ts growing an import.
 */
const HOURS = join(SRC, "lib/restaurantHours.ts");
const STATUS = join(SRC, "lib/restaurantStatus.ts");

// Routes that reached restaurantHours only through the status names.
// Measured 3.5-3.6 KB gz lighter beyond the critical path when this was split.
const STATUS_ONLY_ROUTES = [
  "components/AdvancedSearchPage.tsx",
  "pages/AdminAnalyticsPage.tsx",
  "pages/AdminTools.tsx",
  "pages/BestOfCategory.tsx",
  "pages/Deals.tsx",
  "pages/NeighborhoodPage.tsx",
  "pages/PlaygroundDetails.tsx",
  "pages/WhatsNew.tsx",
  "pseo/pages/PseoRoutePage.tsx",
];

describe("the restaurant status helpers are importable without the hours parser", () => {
  it("walker control: restaurantHours reaches restaurantStatus", () => {
    expect(eagerGraph(HOURS).has(STATUS)).toBe(true);
  });

  it("walker control: a route that needs the parser still reaches it", () => {
    expect(eagerGraph(join(SRC, "pages/RestaurantDetails.tsx")).has(HOURS)).toBe(true);
  });

  it("restaurantStatus.ts imports none of our own modules", () => {
    expect([...eagerGraph(STATUS).keys()]).toEqual([STATUS]);
  });

  it.each(STATUS_ONLY_ROUTES)("%s reaches restaurantStatus but not restaurantHours", (route) => {
    const graph = eagerGraph(join(SRC, route));
    expect(graph.has(STATUS)).toBe(true);
    expect(graph.has(HOURS) ? chain(graph, HOURS) : null).toBeNull();
  });

  it("restaurantHours re-exports the same functions and values, so old imports keep working", () => {
    const names = Object.keys(status);
    expect(names.length).toBeGreaterThanOrEqual(9);
    for (const name of names) {
      expect(hours[name as keyof typeof hours], name).toBe(status[name as keyof typeof status]);
    }
  });
});
