import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SRC, chain, eagerGraph } from "./support/eagerGraph";

/**
 * WEB-PERF-069. zod is 11.9 KB gzipped, and on /events, /search and
 * /dashboard the only module that pulled it in was src/lib/savedSearchFilters.ts,
 * which used it to coerce eight saved-filter values to strings. It now does that
 * in plain code, so these routes stop downloading zod.
 *
 * eagerGraph does not follow packages, so this looks for any reached file of
 * ours with a runtime (non-type) import of "zod".
 */
const ROUTES = ["pages/EventsPage.tsx", "pages/SearchResults.tsx", "pages/UserDashboard.tsx"];

const ZOD_IMPORT = /(?:^|\n)\s*import\s+(?!type\s)[^;]*?\s+from\s+["']zod["']/;

function zodImporters(entry: string): string[] {
  const graph = eagerGraph(entry);
  return [...graph.keys()].filter((f) => ZOD_IMPORT.test(readFileSync(f, "utf8"))).map((f) => chain(graph, f));
}

describe("route chunks without zod (WEB-PERF-069)", () => {
  it("would catch a zod import (detector control: /auth's forms use zod)", () => {
    expect(zodImporters(join(SRC, "pages/Auth.tsx")).length).toBeGreaterThan(0);
  });

  it("still reaches savedSearchFilters from /events (walker control)", () => {
    expect(eagerGraph(join(SRC, "pages/EventsPage.tsx")).has(join(SRC, "lib/savedSearchFilters.ts"))).toBe(true);
  });

  it.each(ROUTES)("%s statically reaches no zod import", (rel) => {
    expect(zodImporters(join(SRC, rel)), "zod belongs to form routes; read loose JSON with plain code").toEqual([]);
  });
});
