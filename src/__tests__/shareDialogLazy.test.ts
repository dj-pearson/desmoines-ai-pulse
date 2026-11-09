import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT, SRC, chain, eagerGraph } from "./support/eagerGraph";

/**
 * WEB-PERF-073. The share dialog (Radix Dialog, Input, Label, five lucide
 * icons, the share-URL builder) was in the static closure of every detail
 * route and of /events through EventCard, though it renders only after a
 * Share click. ShareDialog is now the trigger alone and loads
 * ShareDialogPanel on the first open.
 *
 * A static import of the panel is the regression, wherever it sits: the only
 * importer allowed is ShareDialog's import().
 */
const STATIC_IMPORT =
  /(?:^|\n)\s*(?:import|export)\s+(?!type\s)[^;]*?\s+from\s+["'](?:@\/components\/|\.\/)ShareDialogPanel["']/;

const PANEL = join(SRC, "components/ShareDialogPanel.tsx");
const TRIGGER = join(SRC, "components/ShareDialog.tsx");

/** Lazy chunks that reached the dialog statically before this change. */
const ROUTES = [
  "pages/EventDetails.tsx",
  "pages/AttractionDetails.tsx",
  "pages/ArticleDetails.tsx",
  "pages/PlaygroundDetails.tsx",
  "pages/RestaurantDetails.tsx",
  "pages/EventsPage.tsx",
  "components/EventCard.tsx",
  "components/SocialEventCard.tsx",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : sourceFiles(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

describe("ShareDialogPanel stays out of route closures (WEB-PERF-073)", () => {
  it("detector control: catches a static import, ignores import() and type-only imports", () => {
    expect(STATIC_IMPORT.test('import { ShareDialogPanel } from "@/components/ShareDialogPanel";')).toBe(true);
    expect(STATIC_IMPORT.test("import { ShareDialogPanel } from './ShareDialogPanel';")).toBe(true);
    expect(STATIC_IMPORT.test('import type { ShareDialogPanelProps } from "@/components/ShareDialogPanel";')).toBe(false);
    expect(STATIC_IMPORT.test('import("@/components/ShareDialogPanel")')).toBe(false);
    expect(STATIC_IMPORT.test(readFileSync(TRIGGER, "utf8"))).toBe(false);
  });

  it("walker control: EventDetails reaches the trigger but not the panel", () => {
    const graph = eagerGraph(join(SRC, "pages/EventDetails.tsx"));
    expect(graph.has(TRIGGER)).toBe(true);
    expect(graph.has(PANEL)).toBe(false);
  });

  it("no source file imports ShareDialogPanel statically", () => {
    const offenders = sourceFiles(SRC)
      .filter((f) => STATIC_IMPORT.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROOT, f));
    expect(offenders, 'render the dialog with ShareDialog from "@/components/ShareDialog"').toEqual([]);
  });

  it("the trigger does not pull in the dialog primitives itself", () => {
    const graph = eagerGraph(TRIGGER);
    for (const rel of ["components/ui/dialog.tsx", "components/ui/input.tsx", "lib/shareLinks.ts"]) {
      const file = join(SRC, rel);
      expect(graph.has(file) ? chain(graph, file) : null, rel).toBeNull();
    }
  });

  it.each(ROUTES)("%s statically reaches no ShareDialogPanel", (rel) => {
    const graph = eagerGraph(join(SRC, rel));
    expect(graph.has(PANEL) ? chain(graph, PANEL) : null).toBeNull();
  });
});
