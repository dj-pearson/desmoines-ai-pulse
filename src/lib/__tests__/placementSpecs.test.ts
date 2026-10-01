import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, basename } from "node:path";
import { PLACEMENT_SPECS, joinPages } from "@/lib/placementSpecs";
import type { PlacementPage, PlacementType } from "@/lib/placementSpecs";

/**
 * Business plan WP1 item 4. /advertise tells a buyer where each slot runs, and
 * that sentence is built from `pages`. The old copy said the top banner ran on
 * "every page" and it ran on two. This reads the actual mounts and fails when
 * the spec and the code disagree, in either direction.
 */

const SRC = "src";

/** The file that renders each page a buyer knows by name. */
const PAGE_FILES: Record<string, PlacementPage> = {
  "src/pages/Index.tsx": "Home",
  "src/pages/EventsPage.tsx": "Events",
  "src/pages/Restaurants.tsx": "Restaurants",
  "src/pages/Attractions.tsx": "Attractions",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === "__tests__" || name === "node_modules") continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const FILES = walk(SRC).map((f) => relative(process.cwd(), f).split("\\").join("/"));
const SOURCES = new Map(FILES.map((f) => [f, readFileSync(f, "utf8")]));

/** Is a component module imported by anything? Dead components don't count as mounts. */
function isImported(file: string): boolean {
  const stem = basename(file).replace(/\.tsx?$/, "");
  const pattern = new RegExp(`from\\s+["'][^"']*/${stem}["']|import\\(\\s*["'][^"']*/${stem}["']`);
  for (const [other, text] of SOURCES) {
    if (other !== file && pattern.test(text)) return true;
  }
  return false;
}

function adBannerMounts(): Map<PlacementType, Set<PlacementPage>> {
  const mounts = new Map<PlacementType, Set<PlacementPage>>();
  const unknown: string[] = [];
  for (const [file, text] of SOURCES) {
    if (file.endsWith("components/AdBanner.tsx")) continue;
    for (const m of text.matchAll(/<AdBanner\s+placement="([a-z_]+)"/g)) {
      const placement = m[1] as PlacementType;
      const page = PAGE_FILES[file];
      if (!page) {
        if (isImported(file)) unknown.push(`${file} mounts ${placement}`);
        continue;
      }
      if (!mounts.has(placement)) mounts.set(placement, new Set());
      mounts.get(placement)!.add(page);
    }
  }
  if (unknown.length > 0) {
    throw new Error(
      `AdBanner mounted outside a known page file. Add the page to PAGE_FILES and to the spec's pages:\n  ${unknown.join("\n  ")}`,
    );
  }
  return mounts;
}

describe("PLACEMENT_SPECS pages match where the slots are mounted", () => {
  const mounts = adBannerMounts();

  for (const spec of Object.values(PLACEMENT_SPECS)) {
    if (spec.type === "sponsored_listing") continue;
    it(`${spec.type} lists exactly the pages that mount it`, () => {
      const mounted = [...(mounts.get(spec.type) ?? [])].sort();
      expect([...spec.pages].sort()).toEqual(mounted);
    });
  }

  it("every mounted placement is on sale", () => {
    for (const placement of mounts.keys()) {
      expect(PLACEMENT_SPECS[placement], `${placement} is mounted but has no spec`).toBeDefined();
    }
  });

  it("sponsored_listing names only pages that lift sponsored rows", () => {
    for (const page of PLACEMENT_SPECS.sponsored_listing.pages) {
      const file = Object.keys(PAGE_FILES).find((f) => PAGE_FILES[f] === page)!;
      expect(SOURCES.get(file), `${file} does not call arrangeSponsored`).toMatch(/arrangeSponsored\(/);
    }
  });

  it("builds each description from its pages", () => {
    for (const spec of Object.values(PLACEMENT_SPECS)) {
      expect(spec.description).toContain(joinPages(spec.pages));
    }
  });
});

describe("placement copy makes no claim the code can't back", () => {
  const all = JSON.stringify(PLACEMENT_SPECS);

  it("says nothing about every page, search results or AI boosts", () => {
    expect(all).not.toMatch(/every page|all pages|search results|AI recommendations/i);
  });

  it("gives one DPI answer: pixels are what the upload checks", () => {
    expect(all).not.toMatch(/300 DPI|72 DPI/);
  });
});

describe("joinPages", () => {
  it("reads like a sentence", () => {
    expect(joinPages(["Home"])).toBe("Home");
    expect(joinPages(["Home", "Events"])).toBe("Home and Events");
    expect(joinPages(["Home", "Events", "Restaurants"])).toBe("Home, Events and Restaurants");
  });
});
