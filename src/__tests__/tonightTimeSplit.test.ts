import { describe, expect, it } from "vitest";
import { join } from "node:path";
import * as pairings from "@/lib/tonightPairings";
import * as time from "@/lib/tonightTime";
import { SRC, chain, eagerGraph } from "./support/eagerGraph";

/**
 * WEB-PERF-079. tonightPairings.ts held both the Tonight clock
 * (tonightWindow, EVENING_START_HOUR, eventStartInstant, formatMiles) and the
 * pairing logic, which imports the free-text hours parser (restaurantHours.ts)
 * and the weather hook. The event landings, the hubs and the hotel and venue
 * pages wanted only the clock, and paid about 6 KB gz each for the rest.
 * The clock now lives in tonightTime.ts.
 *
 * The regression is any static path from those routes back to
 * tonightPairings.ts or restaurantHours.ts, or tonightTime.ts growing an
 * import of either.
 */
const PAIRINGS = join(SRC, "lib/tonightPairings.ts");
const HOURS = join(SRC, "lib/restaurantHours.ts");
const TIME = join(SRC, "lib/tonightTime.ts");

// Routes that reached restaurantHours only through the clock half. Measured
// 1.9-6.5 KB gz lighter beyond the critical path when this was split.
const CLOCK_ONLY_ROUTES = [
  "DateNightEvents",
  "EventsByLocation",
  "EventsNearMe",
  "EventsThisWeekend",
  "EventsToday",
  "FreeEvents",
  "Hotels",
  "HotelsNearVenue",
  "KidsEvents",
  "MonthlyEventsPage",
  "MusicHub",
  "OutdoorsHub",
  "Playgrounds",
  "SportsHub",
  "VenueDetail",
];

function reaches(graph: Map<string, string>, file: string): string | null {
  return graph.has(file) ? chain(graph, file) : null;
}

describe("the Tonight clock is importable without the pairing logic", () => {
  it("walker control: tonightPairings reaches restaurantHours and tonightTime", () => {
    const graph = eagerGraph(PAIRINGS);
    expect(graph.has(HOURS)).toBe(true);
    expect(graph.has(TIME)).toBe(true);
  });

  it("tonightTime.ts imports none of our own modules", () => {
    expect([...eagerGraph(TIME).keys()]).toEqual([TIME]);
  });

  it.each(CLOCK_ONLY_ROUTES)("%s reaches tonightTime but not tonightPairings or restaurantHours", (route) => {
    const graph = eagerGraph(join(SRC, "pages", `${route}.tsx`));
    expect(graph.has(TIME)).toBe(true);
    expect(reaches(graph, PAIRINGS)).toBeNull();
    expect(reaches(graph, HOURS)).toBeNull();
  });

  it("tonightPairings re-exports the same functions and values, so old imports keep working", () => {
    const names = Object.keys(time).filter((n) => n !== "CENTRAL" && n !== "NO_TIME_MARKER");
    expect(names.length).toBeGreaterThan(15);
    for (const name of names) {
      expect(pairings[name as keyof typeof pairings], name).toBe(time[name as keyof typeof time]);
    }
  });
});
