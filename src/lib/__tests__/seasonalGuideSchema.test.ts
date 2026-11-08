/**
 * WEB-SEO-067: /guides/:slug head metadata and Article JSON-LD.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BRAND } from "@/lib/brandConfig";
import {
  buildSeasonalGuideJsonLd,
  guideImageUrl,
  guideMetaDescription,
  guideMetaTitle,
  guidePublishedAt,
} from "@/lib/seasonalGuideSchema";

const GUIDE = {
  slug: "fall-in-des-moines",
  title: "Fall in Des Moines",
  description: "Apple orchards, corn mazes and the Covered Bridges trail.",
  seo_title: null,
  seo_description: null,
  cover_image: "https://images.example.com/fall.jpg",
  publish_date: "2026-09-01T12:00:00Z",
  created_at: "2026-08-20T12:00:00Z",
  updated_at: "2026-09-15T08:00:00Z",
};

describe("buildSeasonalGuideJsonLd", () => {
  const node = buildSeasonalGuideJsonLd(GUIDE);

  it("carries the fields Google's Article guidelines list", () => {
    expect(node["@type"]).toBe("Article");
    expect(node.headline).toBe(GUIDE.title);
    expect(node.image).toBe(GUIDE.cover_image);
    expect(node.datePublished).toBe(GUIDE.publish_date);
    expect(node.dateModified).toBe(GUIDE.updated_at);
    expect(node.publisher["@id"]).toBe(`${BRAND.baseUrl}/#organization`);
    expect(node.author["@id"]).toBe(`${BRAND.baseUrl}/#organization`);
  });

  it("points mainEntityOfPage and url at the canonical guide URL", () => {
    const url = `${BRAND.baseUrl}/guides/fall-in-des-moines`;
    expect(node.url).toBe(url);
    expect(node.mainEntityOfPage).toEqual({ "@type": "WebPage", "@id": url });
  });

  it("falls back to created_at, and dateModified to the published date", () => {
    const n = buildSeasonalGuideJsonLd({ ...GUIDE, publish_date: null, updated_at: null });
    expect(n.datePublished).toBe(GUIDE.created_at);
    expect(n.dateModified).toBe(GUIDE.created_at);
  });

  it("omits dates and description rather than emitting empty values", () => {
    const n = buildSeasonalGuideJsonLd({
      slug: "x",
      title: "X",
      description: "  ",
      publish_date: null,
      created_at: null,
      updated_at: null,
    });
    expect("datePublished" in n).toBe(false);
    expect("dateModified" in n).toBe(false);
    expect("description" in n).toBe(false);
  });

  it("uses the default OG card when the cover is missing or not an absolute URL", () => {
    const fallback = `${BRAND.baseUrl}${BRAND.ogImage}`;
    expect(buildSeasonalGuideJsonLd({ ...GUIDE, cover_image: null }).image).toBe(fallback);
    expect(buildSeasonalGuideJsonLd({ ...GUIDE, cover_image: "/img/fall.jpg" }).image).toBe(fallback);
    expect(buildSeasonalGuideJsonLd({ ...GUIDE, cover_image: "javascript:alert(1)" }).image).toBe(fallback);
  });
});

describe("guide head helpers", () => {
  it("guideImageUrl accepts only http(s)", () => {
    expect(guideImageUrl({ cover_image: " https://a.example/x.png " })).toBe("https://a.example/x.png");
    expect(guideImageUrl({ cover_image: "data:image/png;base64,AA" })).toBeNull();
    expect(guideImageUrl({ cover_image: "" })).toBeNull();
  });

  it("guideMetaDescription prefers seo_description and is never empty", () => {
    expect(guideMetaDescription({ ...GUIDE, seo_description: "SEO copy" })).toBe("SEO copy");
    expect(guideMetaDescription(GUIDE)).toBe(GUIDE.description);
    const bare = guideMetaDescription({ slug: "x", title: "Winter Lights", description: null });
    expect(bare).toContain("Winter Lights");
    expect(bare.length).toBeGreaterThan(20);
  });

  it("guideMetaTitle prefers seo_title", () => {
    expect(guideMetaTitle({ ...GUIDE, seo_title: "Fall Guide 2026" })).toBe("Fall Guide 2026");
    expect(guideMetaTitle(GUIDE)).toBe(GUIDE.title);
  });

  it("guidePublishedAt is null with neither date", () => {
    expect(guidePublishedAt({ slug: "x", title: "X" })).toBeNull();
  });
});

describe("SeasonalGuide page source", () => {
  // Comments stripped so the explanation of the rule cannot satisfy it.
  const code = readFileSync("src/pages/SeasonalGuide.tsx", "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  it("renders SEOHead as an article with the guide's JSON-LD", () => {
    expect(code).toMatch(/<SEOHead[\s\S]*?type="article"/);
    expect(code).toMatch(/structuredData=\{buildSeasonalGuideJsonLd\(guide\)\}/);
  });

  it("writes no ld+json script of its own", () => {
    expect(code).not.toMatch(/application\/ld\+json/);
    expect(code).not.toMatch(/JSON\.stringify/);
  });

  it("does not pass breadcrumbs to SEOHead (DetailBreadcrumb emits the one BreadcrumbList)", () => {
    const head = code.slice(code.indexOf("<SEOHead"), code.indexOf("/>", code.indexOf("<SEOHead")));
    expect(head).not.toMatch(/breadcrumbs=/);
    expect(code).toMatch(/<DetailBreadcrumb/);
  });
});
