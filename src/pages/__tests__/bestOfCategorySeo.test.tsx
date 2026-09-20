import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * WEB-SEO-035 AC3. /best-of/:category was the one family held out of the
 * sitemaps, and the reason was one missing tag.
 *
 * BestOfCategory.tsx had a Helmet title and description and NO canonical, so
 * every category page would have been submitted carrying the SPA shell's
 * canonical - each one declaring itself a duplicate of the home page. That is
 * the WEB-SEO-006 failure, and submitting the family in that state would have
 * measured the problem rather than fixed it.
 *
 * Now that the family IS in sitemap-best-of.xml, removing either the canonical
 * or the schema silently recreates it: the pages keep being submitted.
 */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/.*$/gm, "");
}

const PAGE = codeOnly(readFileSync("src/pages/BestOfCategory.tsx", "utf8"));
const HOOK = codeOnly(readFileSync("src/hooks/useVoting.ts", "utf8"));

describe("BestOfCategory is submittable", () => {
  it("emits a canonical built from the route param", () => {
    expect(PAGE).toMatch(/<RouteCanonical\s+path=\{`\/best-of\/\$\{categorySlug/);
  });

  it("emits the canonical outside the loading branch", () => {
    // The detail pages put RouteCanonical in their early-returning loading
    // branch because SEOHead emits a second one after the fetch. This page has
    // no SEOHead, so a canonical that waits for `category` is a canonical the
    // prerenderer can miss - which is the defect RouteCanonical was written for.
    const canonicalAt = PAGE.indexOf("<RouteCanonical");
    const loadingAt = PAGE.indexOf("isLoading ?");
    expect(canonicalAt).toBeGreaterThan(-1);
    expect(canonicalAt).toBeLessThan(loadingAt);
  });

  it("emits an ItemList only when it has items to list", () => {
    // ItemListSchema's own docstring: an ItemList of nothing is a claim a
    // crawler can check and find false.
    expect(PAGE).toMatch(/schemaItems\.length > 0 && \(\s*<ItemListSchema/);
  });

  it("lists only entries that have a page", () => {
    expect(PAGE).toMatch(/\.filter\(\(r\) => r\.url && r\.name\)/);
  });

  it("does not name attractions.slug, which is not applied yet", () => {
    // Migration 20260919000008 adds it. PostgREST fails the WHOLE query on
    // 42703, so naming it in this SELECT before it lands would empty the
    // leaderboard rather than skip a link. The attractions grid derives its
    // slug from the name and so does this.
    expect(HOOK).toMatch(/createSlug\(attr\.name\)/);
    expect(HOOK).not.toMatch(/from\('attractions'\)[\s\S]{0,80}slug/);
  });

  it("uses the restaurants slug column with an id fallback", () => {
    expect(HOOK).toMatch(/rest\.slug \|\| rest\.id/);
  });
});
