import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT, SRC, chain, eagerGraph } from "./support/eagerGraph";

/**
 * WEB-PERF-070. sonner is 9.2 KB gzipped. 88 modules imported `toast` from it
 * at module scope, which put it in the static closure of nearly every route,
 * so a route chunk could not run until sonner had downloaded. They now import
 * src/lib/toast.ts, which loads sonner on the first toast.
 *
 * eagerGraph does not follow packages, so this looks for reached files of
 * ours with a runtime (non-type) import of "sonner".
 */
const SONNER_IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?!type\s)[^;]*?\s+from\s+["']sonner["']/;

/** The lazily mounted Toaster is the one other module allowed to import sonner. */
const TOASTER = join(SRC, "components/ui/sonner.tsx");

const ROUTES = [
  "pages/Index.tsx",
  "pages/EventsPage.tsx",
  "pages/Restaurants.tsx",
  "pages/EventDetails.tsx",
  "pages/EventsToday.tsx",
  "pages/Attractions.tsx",
];

function sonnerImporters(files: Iterable<string>): string[] {
  return [...files].filter((f) => f !== TOASTER && SONNER_IMPORT.test(readFileSync(f, "utf8")));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : sourceFiles(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

describe("sonner stays out of route closures (WEB-PERF-070)", () => {
  it("detector control: catches a runtime sonner import, ignores a type-only one", () => {
    expect(SONNER_IMPORT.test(readFileSync(TOASTER, "utf8"))).toBe(true);
    expect(SONNER_IMPORT.test('import { toast } from "sonner";')).toBe(true);
    expect(SONNER_IMPORT.test("import type { ExternalToast } from 'sonner';")).toBe(false);
    expect(SONNER_IMPORT.test(readFileSync(join(SRC, "lib/toast.ts"), "utf8"))).toBe(false);
  });

  it("walker control: /events still reaches the lazy toast wrapper", () => {
    expect(eagerGraph(join(SRC, "pages/EventsPage.tsx")).has(join(SRC, "lib/toast.ts"))).toBe(true);
  });

  it("no source file outside the Toaster imports sonner for a runtime value", () => {
    const offenders = sonnerImporters(sourceFiles(SRC)).map((f) => relative(ROOT, f));
    expect(offenders, 'import { toast } from "@/lib/toast", which loads sonner on first use').toEqual([]);
  });

  it.each(ROUTES)("%s statically reaches no sonner import", (rel) => {
    const graph = eagerGraph(join(SRC, rel));
    expect(sonnerImporters(graph.keys()).map((f) => chain(graph, f))).toEqual([]);
  });
});
