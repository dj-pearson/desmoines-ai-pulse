import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPlaygroundFaqs } from "@/lib/playgroundFaqs";

// WEB-SEO-055. playgrounds.rating is written by the ai-crawler and
// firecrawl-scraper playground paths as `rating: item.rating || null` - a
// number a model read off a crawled page - and enhance-content asks a model to
// fill it. Nothing records whose rating it is, so neither FAQPage nor a meta
// tag may publish it.

const rated = {
  name: "Union Park Playground",
  age_range: "2-12",
  location: "1501 Saylor Rd, Des Moines, IA",
  latitude: 41.61,
  amenities: ["Restrooms", "Shade"],
  rating: 4.5,
};

describe("buildPlaygroundFaqs", () => {
  it("publishes no rating answer, even when the row has a rating", () => {
    const faqs = buildPlaygroundFaqs(rated);
    const text = JSON.stringify(faqs).toLowerCase();
    expect(text).not.toContain("rating");
    expect(text).not.toContain("rated");
    expect(text).not.toContain("out of 5");
    expect(faqs.map((f) => f.question)).toEqual([
      "What ages is Union Park Playground suitable for?",
      "Where is Union Park Playground located?",
      "What amenities does Union Park Playground have?",
    ]);
  });

  it("answers only from columns the row has", () => {
    expect(buildPlaygroundFaqs({ name: "Bare Park" })).toEqual([]);
    const faqs = buildPlaygroundFaqs({ name: "No Map Park", location: "Ankeny, IA" });
    expect(faqs).toEqual([
      { question: "Where is No Map Park located?", answer: "No Map Park is at Ankeny, IA." },
    ]);
  });

  it("mentions the map only when the row has coordinates", () => {
    const [where] = buildPlaygroundFaqs({ name: "P", location: "X", latitude: 41.6 });
    expect(where.answer).toContain("The map on this page gives directions.");
  });
});

describe("the playground page publishes no unsourced rating", () => {
  it("PlaygroundDetails builds its FAQ from the helper, not inline", () => {
    const src = readFileSync("src/pages/PlaygroundDetails.tsx", "utf8");
    expect(src).toContain("buildPlaygroundFaqs(playground)");
    expect(src).not.toMatch(/is rated \$\{/);
  });

  it("EnhancedPlaygroundSEO emits no place:rating meta and no aggregateRating", () => {
    const src = readFileSync("src/components/EnhancedPlaygroundSEO.tsx", "utf8");
    expect(src).not.toMatch(/name="place:rating"/);
    expect(src).not.toMatch(/aggregateRating\s*:/);
  });
});
