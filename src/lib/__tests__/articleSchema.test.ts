/**
 * SEO-037: which articles are NewsArticle and which are BlogPosting, and the
 * fields Google requires on both.
 */
import { describe, expect, it } from "vitest";
import { articleSchemaType, buildArticleJsonLd } from "@/lib/articleSchema";

describe("articleSchemaType", () => {
  it.each([
    // Weekly weekend post (src/lib/weekendArticle.ts) - the live slug as of 2026-10-01.
    "this-weekend-in-des-moines-october-2-4-2026",
    "this-weekend-in-des-moines-december-31-2026-january-2-2027",
    // Openings
    "new-restaurant-openings-in-des-moines",
    "new-restaurants-east-village",
    "now-open-a-new-taqueria-in-beaverdale",
    "grand-opening-at-jordan-creek",
    "restaurant-openings",
    // Month guides
    "things-to-do-in-des-moines-october-2026",
    "november-2026-des-moines-events",
    // SEO-048: timely, dated by the month in its slug.
    "trick-or-treat-times-des-moines-suburbs-october-2026",
  ])("%s is NewsArticle", (slug) => {
    expect(articleSchemaType(slug)).toBe("NewsArticle");
  });

  it.each([
    // Every other published slug as of 2026-10-01.
    "haunted-houses-near-des-moines",
    "corn-mazes-near-des-moines",
    "valley-junctions-artisan-trail-15-local-makers-to-meet-this-fall",
    "soups-on-15-must-try-fall-comfort-dishes-in-des-moines-local-restaurants",
    "best-pumpkin-patches-in-the-des-moines-area-your-complete-fall-guide",
    "the-ultimate-des-moines-patio-guide-20-must-try-outdoor-dining-spots-des-moines-guide",
    // Near misses that must not trip the rule.
    "eye-opening-history-of-the-capitol",
    "may-day-traditions",
    "the-best-of-october",
    "this-weekend-ideas",
    "",
  ])("%s is BlogPosting", (slug) => {
    expect(articleSchemaType(slug)).toBe("BlogPosting");
  });
});

describe("buildArticleJsonLd", () => {
  const base = {
    slug: "corn-mazes-near-des-moines",
    title: "Corn mazes near Des Moines",
    created_at: "2026-09-30T00:00:00Z",
    published_at: "2026-10-01T04:04:24Z",
    updated_at: "2026-10-02T00:00:00Z",
    tags: ["fall"],
    content: "one two three",
  };

  it("carries dates, an Organization author with a url, and a publisher logo", () => {
    const ld = buildArticleJsonLd(base);
    expect(ld["@type"]).toBe("BlogPosting");
    expect(ld.datePublished).toBe("2026-10-01T04:04:24Z");
    expect(ld.dateModified).toBe("2026-10-02T00:00:00Z");
    expect(ld.author).toMatchObject({
      "@type": "Organization",
      name: "Des Moines Insider",
      url: "https://desmoinesinsider.com/about",
    });
    expect(ld.publisher["@type"]).toBe("Organization");
    expect(ld.publisher.logo.url).toBe("https://desmoinesinsider.com/DMI-Logo.png");
  });

  it("falls back to created_at when the row was never stamped published", () => {
    const ld = buildArticleJsonLd({ ...base, published_at: null, updated_at: null });
    expect(ld.datePublished).toBe(base.created_at);
    expect(ld.dateModified).toBe(base.created_at);
  });

  it("types a weekend post as NewsArticle", () => {
    const ld = buildArticleJsonLd({ ...base, slug: "this-weekend-in-des-moines-october-2-4-2026" });
    expect(ld["@type"]).toBe("NewsArticle");
  });
});
