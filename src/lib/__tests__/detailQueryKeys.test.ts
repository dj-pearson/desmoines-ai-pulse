import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { detailQueryKey, DETAIL_STALE_TIME } from "@/lib/detailQueryKeys";
import { STALE_TIME } from "@/lib/queryConfig";

/**
 * WEB-PERF-036 AC3. A prefetch under a key the page does not read is invisible:
 * the hover still costs a request, the page still fetches, and nothing anywhere
 * reports a miss. Same for the freshness window - if the page considers the
 * prefetched entry stale the moment it mounts, the hover bought nothing.
 *
 * The strongest version of this test is the one it cannot be: an assertion that
 * two string literals in two files match is only as good as the next edit. So
 * the keys come from one builder, and what is asserted here is that both sides
 * USE it - which a regex can check and which a rename cannot quietly break.
 */

function codeOnly(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(?<!:)\/\/.*$/, ""))
    .join("\n");
}

const PAIRS = [
  { kind: "attraction", page: "src/pages/AttractionDetails.tsx" },
  { kind: "playground", page: "src/pages/PlaygroundDetails.tsx" },
  { kind: "restaurant", page: "src/pages/RestaurantDetails.tsx" },
] as const;

describe("detailQueryKey", () => {
  it("is stable for the same inputs", () => {
    expect(detailQueryKey("attraction", "science-center")).toEqual(
      detailQueryKey("attraction", "science-center"),
    );
  });

  it("separates kinds that could share a slug", () => {
    // A restaurant and an attraction can both be "the-continental". Collapsing
    // them would serve one page the other's row from cache.
    expect(detailQueryKey("restaurant", "the-continental")).not.toEqual(
      detailQueryKey("attraction", "the-continental"),
    );
  });

  it("uses the CONTENT_DETAIL window, not the global 60-second default", () => {
    expect(DETAIL_STALE_TIME).toBe(STALE_TIME.CONTENT_DETAIL);
    expect(DETAIL_STALE_TIME).toBeGreaterThan(STALE_TIME.SHORT);
  });
});

describe("the detail pages and their prefetchers agree", () => {
  const prefetch = codeOnly("src/hooks/usePrefetchDetail.ts");

  it.each(PAIRS)("$page builds its key with detailQueryKey", ({ kind, page }) => {
    const src = codeOnly(page);
    expect(src).toContain(`detailQueryKey("${kind}"`);
    // The literal form is what this replaced; catching it here is what stops a
    // future edit splitting the two sides apart again.
    expect(src).not.toMatch(new RegExp(`queryKey:\\s*\\["${kind}"`));
  });

  it.each(PAIRS)("$page uses the shared staleTime", ({ page }) => {
    expect(codeOnly(page)).toContain("staleTime: DETAIL_STALE_TIME");
  });

  it("both prefetchers use the same builder and window", () => {
    expect(prefetch).toContain("detailQueryKey('restaurant'");
    expect(prefetch).toContain("detailQueryKey('attraction'");
    expect(prefetch).not.toMatch(/queryKey:\s*\['(restaurant|attraction)'/);
    expect(prefetch.match(/staleTime: DETAIL_STALE_TIME/g)).toHaveLength(2);
    expect(prefetch).not.toContain("2 * 60 * 1000");
  });
});
