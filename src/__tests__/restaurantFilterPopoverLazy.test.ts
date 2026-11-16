import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SRC, chain, eagerGraph } from "./support/eagerGraph";

/**
 * WEB-PERF-078. RestaurantInlineFilters' pills were the only Radix Popover on
 * /restaurants, and the rating panel the only Radix Slider, so the hub carried
 * react-popover, react-popper, floating-ui and react-slider for four popovers
 * that are closed on load. The pills are now static triggers and
 * RestaurantFilterPopover (the Radix half and the panels) loads on first click.
 *
 * The regression is any static path from the hub to ui/popover.tsx,
 * ui/slider.tsx or the lazy popover, wherever it comes from.
 */
const POPOVER = join(SRC, "components/ui/popover.tsx");
const SLIDER = join(SRC, "components/ui/slider.tsx");
const LIVE = join(SRC, "components/RestaurantFilterPopover.tsx");
const PILLS = join(SRC, "components/RestaurantInlineFilters.tsx");
const HUB = join(SRC, "pages/Restaurants.tsx");

function reaches(graph: Map<string, string>, file: string): string | null {
  return graph.has(file) ? chain(graph, file) : null;
}

describe("Radix Popover and Slider stay out of /restaurants (WEB-PERF-078)", () => {
  it("walker control: the lazy half reaches ui/popover and ui/slider statically", () => {
    const graph = eagerGraph(LIVE);
    expect(graph.has(POPOVER)).toBe(true);
    expect(graph.has(SLIDER)).toBe(true);
  });

  it("the pills reach neither ui/popover, ui/slider nor the lazy half", () => {
    const graph = eagerGraph(PILLS);
    expect(reaches(graph, POPOVER)).toBeNull();
    expect(reaches(graph, SLIDER)).toBeNull();
    expect(reaches(graph, LIVE)).toBeNull();
  });

  it("the pills load the lazy half with import()", () => {
    expect(readFileSync(PILLS, "utf8")).toMatch(
      /import\(\s*["']@\/components\/RestaurantFilterPopover["']\s*\)/,
    );
  });

  it("the hub reaches the pills but not ui/popover, ui/slider or the lazy half", () => {
    const graph = eagerGraph(HUB);
    expect(graph.has(PILLS)).toBe(true);
    expect(reaches(graph, POPOVER)).toBeNull();
    expect(reaches(graph, SLIDER)).toBeNull();
    expect(reaches(graph, LIVE)).toBeNull();
  });
});
