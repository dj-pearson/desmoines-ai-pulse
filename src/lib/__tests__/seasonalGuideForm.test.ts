import { describe, expect, it } from "vitest";
import {
  buildGuideRow,
  emptyGuideForm,
  formFromGuide,
  parseSectionsText,
  sectionsToText,
  slugifyGuideTitle,
  type AdminSeasonalGuide,
} from "@/lib/seasonalGuideForm";

const seeded: AdminSeasonalGuide = {
  id: "g1",
  title: "Holiday Lights & Markets in Des Moines",
  slug: "holiday-lights",
  season: "holiday",
  description: "Make the holidays magical.",
  cover_image: null,
  content: {
    sections: [
      { title: "Holiday Light Displays", items: ["Jolly Holiday Lights at Adventureland", "Trail of Lights at Ewing Park"] },
      { title: "Insider Tips", items: ["Brenton Skating Plaza is magical during snowfall"] },
    ],
  },
  is_published: true,
  publish_date: "2026-11-15T00:00:00+00:00",
  seo_title: "Holiday Events in Des Moines 2026",
  seo_description: null,
  updated_at: null,
};

describe("seasonal guide form", () => {
  it("round-trips a seeded guide to the same row", () => {
    const form = formFromGuide(seeded);
    expect(form.publish_date).toBe("2026-11-15");
    const built = buildGuideRow(form);
    expect(built.errors).toEqual({});
    expect(built.row.content).toEqual(seeded.content);
    expect(built.row.slug).toBe("holiday-lights");
    expect(built.row.is_published).toBe(true);
    expect(built.row.seo_description).toBeNull();
  });

  it("parses headings and items, accepting * bullets and blank lines", () => {
    const parsed = parseSectionsText("## Patios\n- Centro\n* Republic on Grand\n\n## Tips\n- Go early\n");
    expect(parsed).toEqual({
      error: null,
      sections: [
        { title: "Patios", items: ["Centro", "Republic on Grand"] },
        { title: "Tips", items: ["Go early"] },
      ],
    });
    expect(parseSectionsText(sectionsToText(parsed.sections))).toEqual(parsed);
  });

  it("names the line that is neither a heading nor an item", () => {
    const parsed = parseSectionsText("## Patios\n- Centro\nRepublic on Grand");
    expect(parsed.error).toMatch(/^Line 3:/);
  });

  it("refuses an item above the first heading and a heading with no items", () => {
    expect(parseSectionsText("- orphan").error).toMatch(/^Line 1:/);
    expect(parseSectionsText("## Patios\n## Tips\n- Go early").error).toContain("Patios");
  });

  it("rejects a bad slug, a relative cover image and a malformed date", () => {
    const built = buildGuideRow({
      ...emptyGuideForm(),
      title: "Winter",
      slug: "Winter 2026",
      cover_image: "/images/winter.jpg",
      publish_date: "12/01/2026",
    });
    expect(built.row).toBeNull();
    expect(Object.keys(built.errors).sort()).toEqual(["cover_image", "publish_date", "slug"]);
  });

  it("will not publish a guide with no sections, but saves it as a draft", () => {
    const base = { ...emptyGuideForm(), title: "Winter", slug: "winter-2026" };
    const published = buildGuideRow({ ...base, is_published: true });
    expect(published.row).toBeNull();
    expect(published.errors.sectionsText).toBeTruthy();
    const draft = buildGuideRow(base);
    expect(draft.errors).toEqual({});
    expect(draft.row.content).toEqual({ sections: [] });
    expect(draft.row.publish_date).toBeNull();
    expect(draft.row.cover_image).toBeNull();
  });

  it("slugifies a title", () => {
    expect(slugifyGuideTitle("Holiday Lights & Markets in Des Moines")).toBe(
      "holiday-lights-and-markets-in-des-moines",
    );
    expect(slugifyGuideTitle("  Café  Crawl!! 2026 ")).toBe("cafe-crawl-2026");
  });
});
