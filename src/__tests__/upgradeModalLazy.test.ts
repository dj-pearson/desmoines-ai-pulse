import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT, SRC, chain, eagerGraph } from "./support/eagerGraph";

/**
 * WEB-PERF-072. UpgradeModal (the paywall dialog) and its imports - Switch,
 * useTrialEligibility, paywallAnalytics, billingStatus - were in the static
 * closure of every route with a PremiumGate, a "Save search" or "Watch this
 * search" button, or the trip planner, because each of those mounted its own
 * copy. The app-root GlobalUpgradeModal already renders it lazily on first
 * open, so every call site now opens that one with openPaywall().
 *
 * A static import of the module is the regression, wherever it sits: the only
 * importers allowed are dynamic import() calls.
 */
const STATIC_IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?!type\s)[^;]*?\s+from\s+["']@\/components\/UpgradeModal["']/;

const MODAL = join(SRC, "components/UpgradeModal.tsx");

/**
 * Lazy chunks that reached the modal statically before this change: four
 * routes, and RatingSystem, which the detail pages load lazily.
 */
const ROUTES = [
  "pages/EventsPage.tsx",
  "pages/SearchResults.tsx",
  "pages/TripPlanner.tsx",
  "components/AdvancedSearchPage.tsx",
  "components/RatingSystem.tsx",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : sourceFiles(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

describe("UpgradeModal stays out of route closures (WEB-PERF-072)", () => {
  it("detector control: catches a static import, ignores import() and type-only imports", () => {
    expect(STATIC_IMPORT.test('import { UpgradeModal } from "@/components/UpgradeModal";')).toBe(true);
    expect(STATIC_IMPORT.test("import UpgradeModal from '@/components/UpgradeModal';")).toBe(true);
    expect(STATIC_IMPORT.test('import type { UpgradeModalProps } from "@/components/UpgradeModal";')).toBe(false);
    expect(STATIC_IMPORT.test(readFileSync(join(SRC, "components/GlobalUpgradeModal.tsx"), "utf8"))).toBe(false);
  });

  it("walker control: the app root reaches GlobalUpgradeModal but not the modal itself", () => {
    const graph = eagerGraph(join(SRC, "App.tsx"));
    expect(graph.has(join(SRC, "components/GlobalUpgradeModal.tsx"))).toBe(true);
    expect(graph.has(MODAL)).toBe(false);
  });

  it("no source file imports UpgradeModal statically", () => {
    const offenders = sourceFiles(SRC)
      .filter((f) => STATIC_IMPORT.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROOT, f));
    expect(offenders, 'open the paywall with openPaywall() from "@/lib/paywallStore"').toEqual([]);
  });

  it.each(ROUTES)("%s statically reaches no UpgradeModal", (rel) => {
    const graph = eagerGraph(join(SRC, rel));
    expect(graph.has(MODAL) ? chain(graph, MODAL) : null).toBeNull();
  });
});
