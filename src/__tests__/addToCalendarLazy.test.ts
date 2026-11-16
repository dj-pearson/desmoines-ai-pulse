import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SRC, chain, eagerGraph } from "./support/eagerGraph";

/**
 * WEB-PERF-076. AddToCalendarButton was the only Radix
 * DropdownMenu on the event routes, so every event landing, /events and the
 * event detail page carried @radix-ui/react-menu and its popper, roving-focus
 * and focus-scope helpers for a button few people press. The button is now a
 * static trigger and AddToCalendarMenu (the Radix half) loads on first click.
 *
 * The regression is any static path from these routes to ui/dropdown-menu.tsx
 * or to the lazy menu, wherever it comes from.
 */
const DROPDOWN = join(SRC, "components/ui/dropdown-menu.tsx");
const MENU = join(SRC, "components/AddToCalendarMenu.tsx");
const BUTTON = join(SRC, "components/AddToCalendarButton.tsx");

const ROUTES = [
  "pages/EventsPage.tsx",
  "pages/EventDetails.tsx",
  "pages/EventsToday.tsx",
  "pages/EventsThisWeekend.tsx",
  "pages/FreeEvents.tsx",
  "pages/KidsEvents.tsx",
  "pages/DateNightEvents.tsx",
  "pages/EventsByLocation.tsx",
  "pages/MonthlyEventsPage.tsx",
  "pages/EventsNearMe.tsx",
];

describe("Radix DropdownMenu stays out of the event routes (WEB-PERF-076)", () => {
  it("walker control: the menu itself reaches ui/dropdown-menu statically", () => {
    expect(eagerGraph(MENU).has(DROPDOWN)).toBe(true);
  });

  it("the button reaches neither ui/dropdown-menu nor the menu", () => {
    const graph = eagerGraph(BUTTON);
    expect(graph.has(DROPDOWN) ? chain(graph, DROPDOWN) : null).toBeNull();
    expect(graph.has(MENU) ? chain(graph, MENU) : null).toBeNull();
  });

  it("the button loads the menu with import()", () => {
    expect(readFileSync(BUTTON, "utf8")).toMatch(
      /import\(\s*["']@\/components\/AddToCalendarMenu["']\s*\)/,
    );
  });

  it.each(ROUTES)("%s reaches AddToCalendarButton but not ui/dropdown-menu", (rel) => {
    const graph = eagerGraph(join(SRC, rel));
    expect(graph.has(BUTTON)).toBe(true);
    expect(graph.has(DROPDOWN) ? chain(graph, DROPDOWN) : null).toBeNull();
    expect(graph.has(MENU) ? chain(graph, MENU) : null).toBeNull();
  });
});
