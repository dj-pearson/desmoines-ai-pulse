import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A failed fetch and a missing row are different answers (WEB-SEO-040).
 *
 * Six detail pages rendered the not-found branch - "not found" plus a
 * noindex - on ANY error, because they destructured only `data` and
 * `isLoading`. None of their queries sets throwOnError, so RouteErrorBoundary
 * never saw them either. A transient PostgREST blip on a real page therefore
 * asked Google to drop it.
 *
 * SOURCE ASSERTIONS rather than rendering: every one of these pages mounts
 * Header, Footer, a map and a dozen UI primitives, and what is being pinned is
 * which branch owns the noindex - a structural property of the file.
 */
const PAGES = [
  ["src/pages/VenueDetail.tsx", "venueError"],
  ["src/pages/TeamDetail.tsx", "teamError"],
  ["src/pages/TrailDetail.tsx", "error"],
  ["src/pages/ItineraryDetail.tsx", "error"],
  ["src/pages/SeasonalGuide.tsx", "error"],
  ["src/pages/HotelDetails.tsx", "error"],
] as const;

/** Source with comments removed, so the prose explaining a rule cannot satisfy it. */
function codeOnly(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(?<!:)\/\/.*$/, ""))
    .join("\n");
}

describe("detail pages separate a failed fetch from a missing row", () => {
  for (const [path, errorVar] of PAGES) {
    describe(path, () => {
      const code = codeOnly(path);

      it("destructures the query error", () => {
        expect(code).toMatch(new RegExp(`\\b${errorVar}\\b`));
      });

      it("has an error branch BEFORE the not-found branch", () => {
        // Order is the behaviour: a not-found check that runs first swallows
        // the error, because a failed query also yields no data.
        const errorBranch = code.search(new RegExp(`if\\s*\\(\\s*${errorVar}\\s*\\)`));
        const notFound = code.search(/if\s*\(\s*!\w+\s*\)\s*\{/);
        expect(errorBranch).toBeGreaterThan(-1);
        expect(notFound).toBeGreaterThan(-1);
        expect(errorBranch).toBeLessThan(notFound);
      });

      it("never pairs the error check with the not-found check", () => {
        // `if (error || !hotel)` is exactly the defect: one branch, one
        // noindex, two different answers. HotelDetails shipped it.
        expect(code).not.toMatch(/if\s*\(\s*\w*[eE]rror\s*\|\|\s*!/);
      });

      it("puts no robots meta in the error branch", () => {
        // The page is fine and the fetch was not. Saying nothing leaves
        // whatever is already indexed alone; a noindex here deindexes a real
        // page over a blip.
        const start = code.search(new RegExp(`if\\s*\\(\\s*${errorVar}\\s*\\)`));
        const end = code.indexOf("if (!", start);
        const branch = code.slice(start, end > start ? end : start + 900);
        expect(branch).not.toContain("noindex");
      });
    });
  }
});

describe("EventDetails' not-found branch", () => {
  const code = codeOnly("src/pages/EventDetails.tsx");

  it("emits noindex and no competing robots meta", () => {
    // SEOHead emits robots="index, follow, ..." unconditionally, so rendering
    // it here published two conflicting directives on one page.
    expect(code).not.toContain("<SEOHead");
    expect(code).toContain('<meta name="robots" content="noindex, follow" />');
  });
});
