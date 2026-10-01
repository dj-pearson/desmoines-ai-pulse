import { describe, it, expect } from "vitest";
import {
  buildSavedSearchUrl,
  describeSavedSearch,
  normalizeSavedSearch,
  planWatchedSearch,
} from "@/lib/savedSearchFilters";

// The three shapes saved_searches actually holds (docs/page-plans/search.md).
const WEB_EVENT_LIST = {
  search_type: "event_list",
  filters: { q: "jazz", category: "Music", location: "west-des-moines", price: "free", preset: "this-weekend", sort: "date" },
};
const IOS_EVENTS_TAB = {
  search_type: "event_list",
  filters: { query: "jazz", tab: "Events", alerts_enabled: true },
};
const IOS_OTHER_TAB = {
  search_type: "advanced",
  filters: { query: "tacos", tab: "Restaurants", alerts_enabled: false },
};
const WEB_ADVANCED = {
  search_type: "advanced",
  filters: {
    query: "brunch",
    category: "All",
    location: "East Village",
    radius: 10,
    priceRange: [0, 200],
    rating: 0,
    dateRange: {},
    timeOfDay: [],
    features: ["outdoor seating"],
    sortBy: "relevance",
    openNow: false,
    featuredOnly: false,
    hasDeals: false,
    accessibility: [],
    tags: [],
  },
};

describe("normalizeSavedSearch", () => {
  it("reads the web event_list shape", () => {
    const n = normalizeSavedSearch(WEB_EVENT_LIST);
    expect(n.kind).toBe("events");
    expect(n.q).toBe("jazz");
    expect(n.label).toBe("'jazz' - Music - West Des Moines - Free - This weekend");
    expect(n.href).toBe(
      "/events?q=jazz&category=Music&location=west-des-moines&price=free&preset=this-weekend&sort=date",
    );
  });

  it("reads the iOS Events-tab shape as a keyword search, not every event", () => {
    const n = normalizeSavedSearch(IOS_EVENTS_TAB);
    expect(n.kind).toBe("events");
    expect(n.q).toBe("jazz");
    expect(n.label).toBe("'jazz'");
    expect(n.label).not.toBe("Every new event");
    expect(n.href).toBe("/events?q=jazz");
  });

  it("sends an iOS non-events row to /search with its tab as the type", () => {
    const n = normalizeSavedSearch(IOS_OTHER_TAB);
    expect(n.kind).toBe("other");
    expect(n.href).toBe("/search?q=tacos&type=restaurants");
    expect(n.label).toBe("'tacos' - Restaurants");
  });

  it("reads the web advanced shape and ignores keys it does not use", () => {
    const n = normalizeSavedSearch(WEB_ADVANCED);
    expect(n.kind).toBe("other");
    expect(n.q).toBe("brunch");
    expect(n.category).toBe("");
    expect(n.href).toBe("/search?q=brunch");
    expect(n.label).toBe("'brunch' - East Village");
  });

  it.each([
    ["{} filters", { search_type: "event_list", filters: {} }],
    ["null filters", { search_type: "event_list", filters: null }],
    ["missing filters", { search_type: "event_list" }],
    ["array filters", { search_type: "event_list", filters: ["jazz"] }],
    ["string filters", { search_type: "event_list", filters: "jazz" }],
    ["wrong value types", { search_type: "event_list", filters: { q: 42, category: null, location: [] } }],
  ])("does not throw on %s", (_name, row) => {
    const n = normalizeSavedSearch(row);
    expect(n.kind).toBe("events");
    expect(n.label).toBe("Every new event");
    expect(n.href).toBe("/events");
  });

  it("does not throw on a null row or an advanced row with null filters", () => {
    expect(normalizeSavedSearch(null).label).toBe("Any search");
    expect(normalizeSavedSearch({ search_type: "advanced", filters: null }).href).toBe("/search");
  });

  it("treats the /events 'no filter' placeholders as unset", () => {
    const n = normalizeSavedSearch({
      search_type: "event_list",
      filters: { category: "all", location: "any-location", price: "any-price" },
    });
    expect(n.label).toBe("Every new event");
    expect(n.href).toBe("/events");
  });

  it("keeps an unknown area value as typed", () => {
    const n = normalizeSavedSearch({ search_type: "event_list", filters: { location: "Pella" } });
    expect(n.label).toBe("Pella");
  });

  it("prefers the web q key when a row has both", () => {
    const n = normalizeSavedSearch({ search_type: "event_list", filters: { q: "blues", query: "jazz" } });
    expect(n.q).toBe("blues");
  });

  it("infers events from the iOS tab when search_type is absent", () => {
    expect(normalizeSavedSearch({ filters: { query: "jazz", tab: "Events" } }).kind).toBe("events");
    expect(normalizeSavedSearch({ filters: { query: "jazz" } }).kind).toBe("other");
  });
});

describe("describeSavedSearch", () => {
  it("maps area slugs to their labels", () => {
    expect(describeSavedSearch({ location: "west-des-moines" })).toBe("West Des Moines");
  });

  it("reads 'Every new event' with no filters", () => {
    expect(describeSavedSearch({})).toBe("Every new event");
    expect(describeSavedSearch(null)).toBe("Every new event");
  });
});

describe("buildSavedSearchUrl", () => {
  it("drops placeholder values", () => {
    expect(buildSavedSearchUrl({ q: "jazz", category: "all", price: "any-price" })).toBe("/events?q=jazz");
  });
});

describe("planWatchedSearch", () => {
  it("saves the keyword chip's tokens, the event category and free", () => {
    const plan = planWatchedSearch("free jazz shows downtown tonight", [
      { key: "keywords", label: '"jazz"', types: ["events", "restaurants"] },
      { key: "category", label: "Music", types: ["events"] },
      { key: "price", label: "Free", types: ["events", "attractions"] },
      { key: "when", label: "Tonight", types: ["events"] },
      { key: "area", label: "downtown", types: ["events"] },
      { key: "type", label: "Events", types: ["events"] },
    ]);
    expect(plan.filters).toEqual({ q: "jazz", category: "Music", price: "free" });
    expect(plan.covers).toBe("New Music events matching 'jazz', free only.");
    expect(plan.notCovered).toEqual(["Tonight", "downtown"]);
  });

  it("saves the model's category word as the canonical category, or names it as not covered", () => {
    const mapped = planWatchedSearch("live music", [{ key: "category", label: "live music", types: ["events"] }]);
    expect(mapped.filters).toEqual({ category: "Music" });
    expect(mapped.notCovered).toEqual([]);

    const unmapped = planWatchedSearch("zzzz", [{ key: "category", label: "zzzz", types: ["events"] }]);
    expect(unmapped.filters.category).toBeUndefined();
    expect(unmapped.notCovered).toEqual(["zzzz"]);
  });

  it("ignores filters that only narrowed other types", () => {
    const plan = planWatchedSearch("cheap tacos", [
      { key: "keywords", label: '"tacos"', types: ["restaurants"] },
      { key: "price", label: "$", types: ["restaurants"] },
      { key: "cuisine", label: "Mexican", types: ["restaurants"] },
    ]);
    expect(plan.filters).toEqual({});
    expect(plan.covers).toBe("New events.");
    expect(plan.notCovered).toEqual([]);
  });

  it("falls back to the typed query when the deploy reports no filters", () => {
    const plan = planWatchedSearch("  jazz  ", []);
    expect(plan.filters).toEqual({ q: "jazz" });
    expect(plan.covers).toBe("New events matching 'jazz'.");
  });

  it("reads filters without a types list as applying to events", () => {
    const plan = planWatchedSearch("jazz", [{ key: "keywords", label: '"jazz"' }, { key: "price", label: "Free" }]);
    expect(plan.filters).toEqual({ q: "jazz", price: "free" });
  });
});
