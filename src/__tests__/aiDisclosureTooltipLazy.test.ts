import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SRC, chain, eagerGraph } from "./support/eagerGraph";

/**
 * WEB-PERF-077. AIDisclosureBadge's hover tooltip was the only
 * Radix popper on the event, restaurant, article and hotel detail routes, so
 * each carried @radix-ui/react-tooltip, react-popper and floating-ui for a
 * tooltip that repeats the pill's aria-label. The badge now loads
 * AIDisclosureTooltip (the Radix half) on the first mouse hover.
 *
 * The regression is any static path from these routes to ui/tooltip.tsx or
 * to the lazy half, wherever it comes from.
 */
const TOOLTIP = join(SRC, "components/ui/tooltip.tsx");
const HALF = join(SRC, "components/AIDisclosureTooltip.tsx");
const BADGE = join(SRC, "components/AIDisclosureBadge.tsx");

const ROUTES = [
  "pages/EventDetails.tsx",
  "pages/RestaurantDetails.tsx",
  "pages/ArticleDetails.tsx",
  "pages/HotelDetails.tsx",
];

describe("Radix Tooltip stays out of the detail routes (WEB-PERF-077)", () => {
  it("walker control: the lazy half reaches ui/tooltip statically", () => {
    expect(eagerGraph(HALF).has(TOOLTIP)).toBe(true);
  });

  it("the badge reaches neither ui/tooltip nor the lazy half", () => {
    const graph = eagerGraph(BADGE);
    expect(graph.has(TOOLTIP) ? chain(graph, TOOLTIP) : null).toBeNull();
    expect(graph.has(HALF) ? chain(graph, HALF) : null).toBeNull();
  });

  it("the badge loads the half with import()", () => {
    expect(readFileSync(BADGE, "utf8")).toMatch(
      /import\(\s*["']@\/components\/AIDisclosureTooltip["']\s*\)/,
    );
  });

  it.each(ROUTES)("%s reaches AIDisclosureBadge but not ui/tooltip", (rel) => {
    const graph = eagerGraph(join(SRC, rel));
    expect(graph.has(BADGE)).toBe(true);
    expect(graph.has(TOOLTIP) ? chain(graph, TOOLTIP) : null).toBeNull();
    expect(graph.has(HALF) ? chain(graph, HALF) : null).toBeNull();
  });
});
