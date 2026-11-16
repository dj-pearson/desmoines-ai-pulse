import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { describe, expect, it, vi } from "vitest";
import { buildPlaygroundHubSections } from "@/lib/playgroundHub";
import { PlaygroundHubGuide } from "@/components/playgrounds/PlaygroundHubGuide";
import { AttractionsFactsIntro } from "@/components/attractions/AttractionsFactsIntro";

/**
 * WEB-PERF-031: the backfill suffixed duplicate names, so the second
 * "Riverview Park" playground is riverview-park-2. A link rebuilt from the
 * name opens the other park. The hub cards moved to the stored slug last
 * loop; these are the guide, map, free-admission, neighborhood and outdoors
 * links on the same pages, which still rebuilt it from the name.
 */

vi.mock("@/hooks/useAttractionFacts", () => ({
  useAttractionFacts: () => ({
    data: [
      {
        name: "Union Park",
        slug: "union-park-2",
        is_free: true,
        facts_verified_at: "2026-10-01T00:00:00Z",
        fact_sources: [{ url: "https://example.org/union", fields: ["is_free"] }],
      },
    ],
  }),
}));

function wrap(ui: React.ReactNode) {
  return render(
    <HelmetProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </HelmetProvider>,
  );
}

describe("stored-slug links on the attraction and playground pages", () => {
  it("the playground hub guide links a duplicate-name park by its stored slug", () => {
    const sections = buildPlaygroundHubSections([
      { id: "a", name: "Riverview Park", slug: "riverview-park-2", amenities: ["Splash pad"] },
    ]);
    wrap(<PlaygroundHubGuide sections={sections} />);
    const link = screen.getByRole("link", { name: /Riverview Park/ });
    expect(link.getAttribute("href")).toBe("/playgrounds/riverview-park-2");
  });

  it("the free-admission list links by the stored slug", () => {
    wrap(<AttractionsFactsIntro total={1} />);
    const link = screen.getByRole("link", { name: "Union Park" });
    expect(link.getAttribute("href")).toBe("/attractions/union-park-2");
  });

  const root = path.resolve(__dirname, "../../..");
  const read = (f: string) => readFileSync(path.join(root, f), "utf8");
  const nameBuilt = /\/(attractions|playgrounds)\/\$\{createSlug\(/;

  it.each([
    "src/components/AttractionsMap.tsx",
    "src/components/PlaygroundsMap.tsx",
    "src/components/NeighborhoodGuide.tsx",
    "src/components/playgrounds/PlaygroundHubGuide.tsx",
    "src/components/attractions/AttractionsFactsIntro.tsx",
    "src/hooks/useOutdoorsNearby.ts",
    "src/pages/DiscoverMap.tsx",
  ])("%s builds no attraction/playground link from the name", (file) => {
    const src = read(file);
    expect(src).not.toMatch(nameBuilt);
    expect(src).not.toMatch(/slug: createSlug\(/);
  });

  it("the queries behind those links select slug", () => {
    expect(read("src/hooks/useAttractionFacts.ts")).toMatch(/\.select\("name, slug,/);
    const outdoors = read("src/hooks/useOutdoorsNearby.ts");
    expect(outdoors).toContain(".select('name, slug, latitude, longitude')");
    expect(outdoors).toContain(".select('name, slug, type, location')");
    const map = read("src/pages/DiscoverMap.tsx");
    expect(map).toContain(".select('id, name, slug, latitude, longitude, description, type,");
    expect(map).toContain(".select('id, name, slug, latitude, longitude, description, age_range')");
  });

  it("the sitemap submits the stored slug for attractions and playgrounds", () => {
    const gen = read("scripts/generate-dynamic-sitemaps.ts");
    expect(gen).not.toMatch(/createSlug\((attraction|playground)\.name\)/);
    expect(gen).toContain(".select('id, name, slug, updated_at')");
    expect(gen).toContain(".select('id, name, slug, updated_at, latitude, longitude')");
  });
});
