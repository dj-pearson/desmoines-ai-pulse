import { describe, expect, it } from "vitest";
import {
  MAX_QUERY_LENGTH,
  isSearchableQuery,
  normalizeSearchQuery,
  parseSearchUrl,
  resultTypeTab,
  searchHref,
  tabResultType,
  withDrop,
  withQuery,
  withTab,
  writeSearchUrl,
  type SearchUrlState,
} from "@/lib/searchUrlState";

const parse = (qs: string) => parseSearchUrl(new URLSearchParams(qs));

describe("normalizeSearchQuery", () => {
  it("collapses whitespace and trims", () => {
    expect(normalizeSearchQuery("  live   music\ttonight ")).toBe("live music tonight");
  });

  it("clamps to the function's limit instead of rejecting", () => {
    const long = "jazz ".repeat(100);
    expect(normalizeSearchQuery(long).length).toBeLessThanOrEqual(MAX_QUERY_LENGTH);
  });

  it("treats null as empty", () => {
    expect(normalizeSearchQuery(null)).toBe("");
    expect(isSearchableQuery("ab")).toBe(false);
    expect(isSearchableQuery(" abc ")).toBe(true);
  });
});

describe("parseSearchUrl", () => {
  it("defaults to all types and no drops", () => {
    expect(parse("q=jazz")).toEqual({ q: "jazz", tab: "all", drop: [] });
  });

  it("reads a known tab and ignores an unknown one", () => {
    expect(parse("q=jazz&type=places").tab).toBe("places");
    expect(parse("q=jazz&type=hotels").tab).toBe("all");
  });

  it("keeps known drop keys only, de-duplicated, in a stable order", () => {
    expect(parse("q=jazz&drop=price,bogus,when,price").drop).toEqual(["when", "price"]);
  });
});

describe("writeSearchUrl", () => {
  it("omits defaults so a plain search stays ?q=", () => {
    expect(writeSearchUrl({ q: "jazz", tab: "all", drop: [] }).toString()).toBe("q=jazz");
  });

  it("round-trips a full state", () => {
    const state: SearchUrlState = { q: "free jazz tonight", tab: "events", drop: ["when"] };
    expect(parseSearchUrl(writeSearchUrl(state))).toEqual(state);
    expect(searchHref(state)).toBe("/search?q=free+jazz+tonight&type=events&drop=when");
  });
});

describe("transitions", () => {
  const base: SearchUrlState = { q: "jazz", tab: "events", drop: ["when"] };

  it("a new query clears drops and keeps the tab", () => {
    expect(withQuery(base, "  blues ")).toEqual({ q: "blues", tab: "events", drop: [] });
  });

  it("adds a drop once", () => {
    expect(withDrop(base, "price").drop).toEqual(["when", "price"]);
    expect(withDrop(base, "when").drop).toEqual(["when"]);
  });

  it("switches tab without touching the rest", () => {
    expect(withTab(base, "all")).toEqual({ q: "jazz", tab: "all", drop: ["when"] });
  });
});

describe("tab and type mapping", () => {
  it("maps both ways", () => {
    expect(tabResultType("all")).toBeNull();
    expect(tabResultType("places")).toBe("attractions");
    expect(tabResultType("stay")).toBe("hotels");
    expect(resultTypeTab("attractions")).toBe("places");
    expect(resultTypeTab("hotels")).toBe("stay");
  });
});
