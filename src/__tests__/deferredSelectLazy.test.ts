import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SRC, chain, eagerGraph } from "./support/eagerGraph";
import { SELECT_TRIGGER_CLASS } from "@/components/ui/deferred-select";

/**
 * WEB-PERF-074. /events, /restaurants and /attractions carried
 * @radix-ui/react-select (plus its collection, popper and focus-scope
 * helpers) in their route closures for closed sort and filter triggers.
 * Those controls are now DeferredSelect, which draws a static trigger and
 * loads the Radix half on the first click or arrow key.
 *
 * The regression is any static path from these routes to ui/select.tsx or to
 * the lazy impl, wherever it comes from.
 */
const SELECT = join(SRC, "components/ui/select.tsx");
const IMPL = join(SRC, "components/ui/deferred-select-impl.tsx");
const DEFERRED = join(SRC, "components/ui/deferred-select.tsx");

const ROUTES = ["pages/EventsPage.tsx", "pages/Restaurants.tsx", "pages/Attractions.tsx"];

describe("Radix Select stays out of the hub routes (WEB-PERF-074)", () => {
  it("walker control: the impl itself reaches ui/select statically", () => {
    expect(eagerGraph(IMPL).has(SELECT)).toBe(true);
  });

  it("the deferred trigger reaches neither ui/select nor the impl", () => {
    const graph = eagerGraph(DEFERRED);
    expect(graph.has(SELECT) ? chain(graph, SELECT) : null).toBeNull();
    expect(graph.has(IMPL) ? chain(graph, IMPL) : null).toBeNull();
  });

  it("the deferred trigger loads the impl with import()", () => {
    expect(readFileSync(DEFERRED, "utf8")).toMatch(/import\(\s*["']\.\/deferred-select-impl["']\s*\)/);
  });

  it("the static trigger draws exactly the Radix trigger's classes", () => {
    // The first string literal inside SelectTrigger's cn(...) in ui/select.tsx.
    const radix = readFileSync(SELECT, "utf8").match(/<SelectPrimitive\.Trigger[\s\S]*?cn\(\s*"([^"]+)"/);
    expect(radix?.[1]).toBeTruthy();
    expect(SELECT_TRIGGER_CLASS).toBe(radix?.[1]);
  });

  it.each(ROUTES)("%s reaches DeferredSelect but not ui/select", (rel) => {
    const graph = eagerGraph(join(SRC, rel));
    expect(graph.has(DEFERRED)).toBe(true);
    expect(graph.has(SELECT) ? chain(graph, SELECT) : null).toBeNull();
    expect(graph.has(IMPL) ? chain(graph, IMPL) : null).toBeNull();
  });
});
