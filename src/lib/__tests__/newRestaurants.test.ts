import { describe, it, expect } from "vitest";
import {
  hasOpeningSource,
  isEvidencedOpeningSoon,
  isRecentOpening,
  newRestaurantsLead,
  openingsInMonth,
  selectNewRestaurants,
  type NewRestaurantRow,
} from "@/lib/newRestaurants";
import {
  buildNewRestaurantsArticle,
  MIN_ARTICLE_OPENINGS,
  newRestaurantsArticleSlug,
  nextMonth,
} from "@/lib/newRestaurantsArticle";

// Midday Central, 2026-10-01.
const NOW = new Date("2026-10-01T17:00:00Z");

const r = (id: string, status: string | null, opening_date: string | null, extra: Partial<NewRestaurantRow> = {}) =>
  ({ id, name: id, slug: id, status, opening_date, ...extra }) as NewRestaurantRow & { slug: string };

describe("isRecentOpening", () => {
  it("counts an opening_date in the last 365 Central days, today included", () => {
    expect(isRecentOpening(r("a", "open", "2026-10-01"), NOW)).toBe(true);
    expect(isRecentOpening(r("b", "open", "2025-10-01"), NOW)).toBe(true);
    expect(isRecentOpening(r("c", "open", "2025-09-30"), NOW)).toBe(false);
    expect(isRecentOpening(r("d", "open", "2026-10-02"), NOW)).toBe(false);
  });

  it("never counts closed, Google-closed, merged or still-upcoming rows", () => {
    expect(isRecentOpening(r("a", "closed", "2026-05-01"), NOW)).toBe(false);
    expect(isRecentOpening(r("b", "open", "2026-05-01", { business_status: "CLOSED_PERMANENTLY" }), NOW)).toBe(false);
    expect(isRecentOpening(r("c", "open", "2026-05-01", { is_merged: true }), NOW)).toBe(false);
    expect(isRecentOpening(r("d", "opening_soon", "2026-05-01"), NOW)).toBe(false);
    expect(isRecentOpening(r("e", "announced", "2026-05-01"), NOW)).toBe(false);
  });

  it("does not count an undated newly_opened flag", () => {
    expect(isRecentOpening(r("a", "newly_opened", null, { opening_timeframe: "2025" }), NOW)).toBe(false);
  });
});

describe("isEvidencedOpeningSoon", () => {
  const src = { source_url: "https://news.example.org/story" };
  it("needs an upcoming status, a future date and a real source", () => {
    expect(isEvidencedOpeningSoon(r("a", "opening_soon", "2026-11-01", src), NOW)).toBe(true);
    expect(isEvidencedOpeningSoon(r("b", "opening_soon", "2026-11-01"), NOW)).toBe(false);
    expect(isEvidencedOpeningSoon(r("c", "opening_soon", "2026-09-01", src), NOW)).toBe(false);
    expect(isEvidencedOpeningSoon(r("d", "announced", null, { ...src, opening_timeframe: "2027" }), NOW)).toBe(false);
    expect(isEvidencedOpeningSoon(r("e", "open", "2026-11-01", src), NOW)).toBe(false);
  });

  it("does not take a search-results URL as a source", () => {
    expect(hasOpeningSource(r("a", null, null, { source_url: "https://www.desmoinesregister.com/search/?q=restaurant+opening" }))).toBe(false);
    expect(hasOpeningSource(r("b", null, null, { source_url: "javascript:alert(1)" }))).toBe(false);
    expect(hasOpeningSource(r("c", null, null, { source_url: "https://www.desmoinesregister.com/story/x/" }))).toBe(true);
  });
});

describe("selectNewRestaurants", () => {
  const rows = [
    r("bonchon", "open", "2026-04-29"),
    r("birdies", "open", "2025-10-04"),
    r("les", "open", "2026-03-31"),
    r("april-too", "open", "2026-04-02"),
    r("stale", "opening_soon", "2026-03-31"),
    r("undated", "newly_opened", null),
    r("old", "open", "2019-05-01"),
    r("gone", "closed", "2026-06-01"),
  ];
  const sel = selectNewRestaurants(rows, NOW);

  it("lists openings newest first under month headers, newest month first", () => {
    expect(sel.opened.map((x) => x.id)).toEqual(["bonchon", "april-too", "les", "birdies"]);
    expect(sel.months.map((m) => [m.label, m.rows.length])).toEqual([
      ["April 2026", 2],
      ["March 2026", 1],
      ["October 2025", 1],
    ]);
    expect(sel.range).toEqual({ first: "2025-10-04", last: "2026-04-29" });
  });

  it("counts flagged rows it leaves off, but not closed or plain old ones", () => {
    expect(sel.setAside).toBe(2); // stale + undated
    expect(sel.openingSoon).toEqual([]);
  });

  it("states the count and date range in the lead", () => {
    expect(newRestaurantsLead(sel)).toBe(
      "4 restaurants opened in the Des Moines area between October 4, 2025 and April 29, 2026, going by the opening date recorded on each listing.",
    );
    expect(newRestaurantsLead(selectNewRestaurants([], NOW))).toBe(
      "No restaurant openings are recorded in the Des Moines area between October 1, 2025 and October 1, 2026.",
    );
    expect(newRestaurantsLead(selectNewRestaurants([r("x", "open", "2026-09-12")], NOW))).toMatch(
      /^1 restaurant opened in the Des Moines area on September 12, 2026,/,
    );
  });
});

describe("monthly article", () => {
  const rows = [
    r("a", "open", "2026-10-01", { cuisine: "Korean", location: "1 Main St, Ankeny, IA" }),
    r("b", "open", "2026-09-30"),
    r("c", "opening_soon", "2026-10-01"),
    r("soon", "opening_soon", "2026-12-01", { source_url: "https://news.example.org/soon" }),
  ];

  it("takes only openings dated in the month, same exclusions as the page", () => {
    expect(openingsInMonth(rows, "2026-10", NOW).map((x) => x.id)).toEqual(["a"]);
    expect(openingsInMonth(rows, "2026-09", NOW).map((x) => x.id)).toEqual(["b"]);
  });

  it("builds a markdown body the publish guard accepts, from row fields only", () => {
    const a = buildNewRestaurantsArticle(rows, "2026-10", "2026-10-31", NOW);
    expect(a.title).toBe("New restaurants in Des Moines: October 2026");
    expect(a.slug).toBe("new-restaurants-in-des-moines-october-2026");
    expect(a.counts).toEqual({ opened: 1, openingSoon: 1 });
    expect(a.content).toMatch(/^\*\*Published October 31, 2026\.\*\* 1 restaurant opened/);
    expect(a.content).toContain("### [a](/restaurants/a)");
    expect(a.content).toContain("- Cuisine: Korean");
    expect(a.content).toContain("[source](https://news.example.org/soon)");
    // SEO-058 guard: not JSON, not HTML-first, no placeholder.
    expect(a.content).not.toMatch(/^[{[`<]/);
    expect(a.content).not.toMatch(/content continues|lorem ipsum/i);
    expect(MIN_ARTICLE_OPENINGS).toBe(3);
  });

  it("names the next month and its slug", () => {
    expect(nextMonth("2026-10")).toBe("2026-11");
    expect(nextMonth("2026-12")).toBe("2027-01");
    expect(newRestaurantsArticleSlug("2026-11")).toBe("new-restaurants-in-des-moines-november-2026");
  });
});
