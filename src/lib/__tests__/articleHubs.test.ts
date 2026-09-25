import { describe, it, expect } from "vitest";
import { articleMatchesHub, hubsForArticle } from "@/lib/articleHubs";

describe("hubsForArticle", () => {
  it("sends the patio guide to restaurants", () => {
    const hrefs = hubsForArticle({ title: "The Ultimate Des Moines Patio Guide", category: "Food & Drink" }).map((h) => h.href);
    expect(hrefs).toContain("/restaurants");
    expect(hrefs).not.toContain("/events/kids");
  });

  it("sends the pumpkin patch guide to family and outdoors", () => {
    const hrefs = hubsForArticle({ title: "Best Pumpkin Patches Near Des Moines", tags: ["fall", "orchards"] }).map((h) => h.href);
    expect(hrefs).toEqual(expect.arrayContaining(["/events/kids", "/outdoors"]));
  });

  it("always ends with the things-to-do hub, even when nothing matches", () => {
    expect(hubsForArticle({ title: "A Note From Us" })).toEqual([{ href: "/things-to-do", title: "Things to do in Des Moines" }]);
  });

  it("matches whole words only", () => {
    expect(articleMatchesHub({ title: "Barbershops of Beaverdale" }, "restaurants")).toBe(false);
    expect(articleMatchesHub({ title: "Parkview Heights history" }, "outdoors")).toBe(false);
  });
});

import {
  AI_ASSISTED_NOTICE,
  AI_AUTO_PUBLISHED_NOTICE,
  AI_SCORED_NOTICE,
  aiBadgeLabel,
  aiDisclosureText,
  classifyArticleHref,
  cuisineMatchesTags,
  preferCuisineMatches,
  isAiArticle,
  isStaleArticle,
  primaryHubForArticle,
  readTimeLabel,
  relatedArticles,
  wasMeaningfullyUpdated,
} from "@/lib/articleHubs";

describe("AI disclosure (Plan & Stay WP4 item 1)", () => {
  it("flags auto-published articles even with no suggestion id", () => {
    expect(isAiArticle({ is_auto_published: true, generated_from_suggestion_id: null })).toBe(true);
    expect(aiDisclosureText({ is_auto_published: true })).toBe(AI_AUTO_PUBLISHED_NOTICE);
  });

  it("never claims editor review for an auto-published article", () => {
    const text = aiDisclosureText({ is_auto_published: true, generated_from_suggestion_id: "x" }) ?? "";
    expect(text).toMatch(/not reviewed by an editor/);
    expect(text).not.toMatch(/reviewed by a human editor/);
  });

  it("does not claim a training set or an editor for suggestion-generated articles", () => {
    const text = aiDisclosureText({ generated_from_suggestion_id: "abc" }) ?? "";
    expect(text).toBe(AI_ASSISTED_NOTICE);
    expect(text).not.toMatch(/trained on public data/);
    expect(text).not.toMatch(/reviewed by a human editor/);
  });

  it("shows nothing for a human-written article", () => {
    expect(isAiArticle({})).toBe(false);
    expect(aiDisclosureText({ is_auto_published: false })).toBeNull();
  });
});

describe("dates", () => {
  it("counts an update only when it is more than a day after publish", () => {
    expect(wasMeaningfullyUpdated("2026-01-01T00:00:00Z", "2026-01-01T20:00:00Z")).toBe(false);
    expect(wasMeaningfullyUpdated("2026-01-01T00:00:00Z", "2026-01-03T00:00:00Z")).toBe(true);
    expect(wasMeaningfullyUpdated(null, "2026-01-03T00:00:00Z")).toBe(false);
  });

  it("marks articles older than 180 days as stale", () => {
    const now = new Date("2026-09-24T00:00:00Z");
    expect(isStaleArticle("2026-01-01T00:00:00Z", now)).toBe(true);
    expect(isStaleArticle("2026-08-01T00:00:00Z", now)).toBe(false);
    expect(isStaleArticle(undefined, now)).toBe(false);
  });

  it("reads 200 words a minute, at least one", () => {
    expect(readTimeLabel("")).toBe("1 min read");
    expect(readTimeLabel(Array(401).fill("w").join(" "))).toBe("3 min read");
  });
});

describe("primaryHubForArticle", () => {
  it("takes the first hub in ARTICLE_HUBS order", () => {
    expect(primaryHubForArticle({ title: "Best Patios", category: "Food" })).toBe("restaurants");
    expect(primaryHubForArticle({ title: "Fall festivals for families" })).toBe("events");
    expect(primaryHubForArticle({ title: "A Note From Us" })).toBeNull();
  });
});

describe("relatedArticles", () => {
  const current = { id: "a", category: "Food", tags: ["Patio", "brunch"] };
  const rows = [
    { id: "a", slug: "a", title: "Self", category: "Food", tags: ["patio"] },
    { id: "b", slug: "b", title: "Same category only", category: "food", tags: [] },
    { id: "c", slug: "c", title: "Two tags", category: "Drinks", tags: ["patio", "Brunch"] },
    { id: "d", slug: "d", title: "Unrelated", category: "Music", tags: ["jazz"] },
    { id: "e", slug: null, title: "No slug", category: "Food", tags: ["patio"] },
    { id: "f", slug: "f", title: "One tag", category: "Drinks", tags: ["patio"] },
  ];

  it("ranks shared tags over category, drops self, unrelated and slugless rows", () => {
    expect(relatedArticles(current, rows).map((r) => r.id)).toEqual(["c", "f", "b"]);
  });

  it("returns nothing when nothing overlaps", () => {
    expect(relatedArticles({ id: "z", category: null, tags: [] }, rows)).toEqual([]);
  });
});

describe("pipeline drafts (pass 2 WP4 item 4)", () => {
  it("treats a quality_score as AI, even when a person published it", () => {
    const row = { quality_score: 72, is_auto_published: false };
    expect(isAiArticle(row)).toBe(true);
    expect(aiDisclosureText(row)).toBe(AI_SCORED_NOTICE);
    expect(AI_SCORED_NOTICE).toMatch(/published by a person on our team/);
    expect(aiBadgeLabel(row)).toBe("AI-assisted");
  });

  it("counts a score of zero, and prefers the auto-published notice", () => {
    expect(isAiArticle({ quality_score: 0 })).toBe(true);
    expect(aiDisclosureText({ quality_score: 90, is_auto_published: true })).toBe(AI_AUTO_PUBLISHED_NOTICE);
    expect(aiBadgeLabel({ is_auto_published: true })).toBe("AI-written");
  });

  it("a null score is not AI", () => {
    expect(isAiArticle({ quality_score: null })).toBe(false);
  });
});

describe("cuisine preference (pass 2 WP4 item 6)", () => {
  it("matches whole words from the tags", () => {
    expect(cuisineMatchesTags("Pizza, Italian", ["patio", "pizza"])).toBe(true);
    expect(cuisineMatchesTags("BBQ", ["bbq"])).toBe(true);
    expect(cuisineMatchesTags("Barbecue", ["bar"])).toBe(false);
    expect(cuisineMatchesTags(null, ["pizza"])).toBe(false);
    expect(cuisineMatchesTags("Mexican", [])).toBe(false);
  });

  it("puts matches first and keeps popularity order otherwise", () => {
    const rows = [
      { id: "1", cuisine: "American" },
      { id: "2", cuisine: "Pizza" },
      { id: "3", cuisine: null },
      { id: "4", cuisine: "Pizza, Bar" },
    ];
    expect(preferCuisineMatches(rows, ["pizza"]).map((r) => r.id)).toEqual(["2", "4", "1", "3"]);
    expect(preferCuisineMatches(rows, []).map((r) => r.id)).toEqual(["1", "2", "3", "4"]);
  });
});

describe("classifyArticleHref (pass 2 WP4 item 12)", () => {
  const site = "https://desmoinesinsider.com";
  it("routes site paths and same-host URLs in-app", () => {
    expect(classifyArticleHref("/restaurants/open-now", site)).toEqual({ kind: "internal", path: "/restaurants/open-now" });
    expect(classifyArticleHref("https://www.desmoinesinsider.com/events?x=1#top", site)).toEqual({
      kind: "internal",
      path: "/events?x=1#top",
    });
  });

  it("marks other hosts external", () => {
    expect(classifyArticleHref("https://example.com/menu", site)).toEqual({ kind: "external", href: "https://example.com/menu" });
    expect(classifyArticleHref("//example.com/a", site).kind).toBe("external");
  });

  it("leaves mailto, fragments and junk as plain anchors", () => {
    expect(classifyArticleHref("mailto:hi@example.com", site).kind).toBe("other");
    expect(classifyArticleHref("#section", site).kind).toBe("other");
    expect(classifyArticleHref(undefined, site).kind).toBe("other");
  });
});
