import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { render, waitFor, cleanup } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { VoteResult, VotingCategory } from "@/hooks/useVoting";
import { rankingSchemaName, stripLeadingBest } from "@/lib/votingStatus";

/**
 * WEB-SEO-035 AC3, and Plan & Stay pass 2 WP5 items 4 and 10.
 *
 * /best-of/:category was the one family held out of the sitemaps because it
 * had no canonical, so every category page declared itself a duplicate of the
 * home page. The first half of this file pins the source shape that fixed it.
 *
 * The second half renders the page. The page withholds a ranking below
 * MIN_VOTES_FOR_RANKING (no medals, no percentages), and the ItemList used to
 * publish one anyway, from any sample, under the name "Best Best Pizza in Des
 * Moines". A ranking claim in JSON-LD is one a crawler reads without the
 * caveat the page prints next to it.
 */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/.*$/gm, "");
}

const PAGE = codeOnly(readFileSync("src/pages/BestOfCategory.tsx", "utf8"));
const HOOK = codeOnly(readFileSync("src/hooks/useVoting.ts", "utf8"));

describe("BestOfCategory is submittable (source)", () => {
  it("builds its canonical from the route param", () => {
    expect(PAGE).toMatch(/const canonicalPath = `\/best-of\/\$\{categorySlug/);
    expect(PAGE).toMatch(/canonicalUrl=\{getCanonicalUrl\(canonicalPath\)\}/);
  });

  it("mounts its one head manager outside the loading branch", () => {
    // The prerender can capture the page while the fetch is in flight, so a
    // canonical that waits for `category` is one it can miss.
    const headAt = PAGE.indexOf("<SEOHead");
    const loadingAt = PAGE.indexOf("isLoading ?");
    expect(headAt).toBeGreaterThan(-1);
    expect(headAt).toBeLessThan(loadingAt);
    // One canonical per render: no RouteCanonical beside SEOHead.
    expect(PAGE).not.toMatch(/<RouteCanonical/);
  });

  it("does not name attractions.slug, which is not applied yet", () => {
    // Migration 20260919000008 adds it. PostgREST fails the WHOLE query on
    // 42703, so naming it before it lands would empty the leaderboard.
    expect(HOOK).toMatch(/createSlug\(attr\.name\)/);
    expect(HOOK).not.toMatch(/from\('attractions'\)[\s\S]{0,80}slug/);
  });

  it("uses the restaurants slug column with an id fallback", () => {
    expect(HOOK).toMatch(/rest\.slug \|\| rest\.id/);
  });
});

describe("rankingSchemaName", () => {
  it("never doubles the word Best", () => {
    expect(rankingSchemaName("Best Pizza")).toBe("Best Pizza in Des Moines");
    expect(rankingSchemaName("best coffee")).toBe("Best coffee in Des Moines");
    expect(rankingSchemaName("Brunch")).toBe("Best Brunch in Des Moines");
    expect(stripLeadingBest("Best")).toBe("Best");
  });
});

// ---- rendered ----------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;

const PIZZA: VotingCategory = {
  id: "c0000000-0000-4000-8000-000000000001",
  name: "Best Pizza",
  slug: "best-pizza",
  description: "Fixture category.",
  icon: "trophy",
  is_active: true,
  voting_start: new Date(Date.now() - 30 * DAY).toISOString(),
  voting_end: new Date(Date.now() + 30 * DAY).toISOString(),
  created_at: "2026-01-01T00:00:00Z",
};

const state: { results: VoteResult[] } = { results: [] };

vi.mock("@/hooks/useVoting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useVoting")>();
  return {
    ...actual,
    useCategoryResults: () => ({
      data: { category: PIZZA, results: state.results },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }),
    useUserVote: () => ({ data: null }),
  };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/components/Header", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/VotingBooth", () => ({ VotingBooth: () => null }));

const listed = (id: string, name: string, votes: number): VoteResult => ({
  entity_type: "restaurant",
  entity_id: id,
  custom_entry: null,
  vote_count: votes,
  name,
  url: `/restaurants/${id}`,
});
const writeIn = (name: string, votes: number): VoteResult => ({
  entity_type: "custom",
  entity_id: null,
  custom_entry: name,
  vote_count: votes,
  name,
});

async function renderPage(): Promise<void> {
  const { default: BestOfCategory } = await import("@/pages/BestOfCategory");
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={["/best-of/best-pizza"]}>
        <Routes>
          <Route path="/best-of/:category" element={<BestOfCategory />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
  // SEOHead's canonical is committed in every state, so it marks "Helmet ran".
  await waitFor(() => {
    if (!document.head.querySelector('link[rel="canonical"]')) throw new Error("head not committed");
  });
}

function jsonLdNodes(): Array<Record<string, unknown>> {
  return Array.from(document.head.querySelectorAll('script[type="application/ld+json"]')).map(
    (s) => JSON.parse(s.textContent ?? "{}") as Record<string, unknown>,
  );
}

const itemLists = () => jsonLdNodes().filter((n) => n["@type"] === "ItemList");
const robots = () => document.head.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "";

describe("BestOfCategory structured data (rendered)", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });
  afterEach(() => {
    cleanup();
  });

  it("emits no ItemList and noindexes a 2-vote category", async () => {
    state.results = [listed("r1", "Fixture Place", 2)];
    await renderPage();
    expect(itemLists()).toHaveLength(0);
    expect(robots()).toBe("noindex, follow");
    expect(document.head.innerHTML).not.toMatch(/Best Best/);
  });

  it("emits no ItemList one vote below the minimum", async () => {
    const { MIN_VOTES_FOR_RANKING } = await import("@/hooks/useVoting");
    state.results = [listed("r1", "Fixture Place", MIN_VOTES_FOR_RANKING - 1)];
    await renderPage();
    expect(itemLists()).toHaveLength(0);
  });

  it("emits a ranked ItemList with on-page positions once ranked", async () => {
    state.results = [writeIn("Fixture Write-in", 20), listed("r1", "Fixture Place", 10)];
    await renderPage();
    const lists = itemLists();
    expect(lists).toHaveLength(1);
    expect(lists[0].name).toBe("Best Pizza in Des Moines");
    const elements = lists[0].itemListElement as Array<{ position: number; name: string }>;
    // The write-in is rank 1 on the page and has no page of its own, so the
    // listed place keeps its on-page rank of 2.
    expect(elements).toHaveLength(1);
    expect(elements[0]).toMatchObject({ position: 2, name: "Fixture Place" });
    expect(robots()).not.toMatch(/noindex/);
    expect(document.head.innerHTML).not.toMatch(/Best Best/);
  });

  it("carries breadcrumbs and a description built from the page's numbers", async () => {
    state.results = [listed("r1", "Fixture Place", 3)];
    await renderPage();
    const crumbs = jsonLdNodes().filter((n) => n["@type"] === "BreadcrumbList");
    expect(crumbs).toHaveLength(1);
    const description = document.head.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
    expect(description).toMatch(/^3 votes cast for Best Pizza in Des Moines\./);
    // Not ranked: the leader isn't named.
    expect(description).not.toMatch(/Leading/);
    expect(description.length).toBeLessThanOrEqual(160);
  });
});
