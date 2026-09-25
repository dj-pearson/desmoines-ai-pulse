/**
 * /search URL state (search plan WP2 items 4 and 5).
 *
 * Everything the results page shows is derived from the URL, so Back, a shared
 * link and a reload all land on the same view, and the TanStack cache keyed on
 * the same values answers Back without a second model call.
 *
 *   q     the query, whitespace collapsed and clamped to 200 characters
 *   type  events | restaurants | places | stay; absent means all
 *   drop  comma-separated applied-filter keys the visitor removed
 *
 * Unknown values are ignored rather than rejected: a hand-edited or old link
 * still opens a working page.
 */
import type { SearchResultType } from "@/lib/searchResultHref";

export const MIN_QUERY_LENGTH = 3;
export const MAX_QUERY_LENGTH = 200;

export const SEARCH_TABS = ["all", "events", "restaurants", "places", "stay"] as const;
export type SearchTab = (typeof SEARCH_TABS)[number];

/** The `appliedFilters[].key` values nlp-search can report (plan, interfaces). */
export const FILTER_KEYS = [
  "type",
  "when",
  "price",
  "area",
  "cuisine",
  "category",
  "kid",
  "budget",
  "keywords",
] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

export interface SearchUrlState {
  q: string;
  tab: SearchTab;
  drop: FilterKey[];
}

/** Section headings and tab labels, per result type. */
export const SECTION_LABELS: Record<SearchResultType, string> = {
  events: "Events",
  restaurants: "Restaurants",
  attractions: "Places",
  hotels: "Places to stay",
};

const TAB_TYPES: Record<Exclude<SearchTab, "all">, SearchResultType> = {
  events: "events",
  restaurants: "restaurants",
  places: "attractions",
  stay: "hotels",
};

/** Collapse whitespace, trim, clamp. The same text is the cache key and the request body. */
export function normalizeSearchQuery(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH).trim();
}

export function isSearchableQuery(q: string): boolean {
  return normalizeSearchQuery(q).length >= MIN_QUERY_LENGTH;
}

function isTab(value: string | null): value is SearchTab {
  return value !== null && (SEARCH_TABS as readonly string[]).includes(value);
}

function isFilterKey(value: string): value is FilterKey {
  return (FILTER_KEYS as readonly string[]).includes(value);
}

/** Known keys only, de-duplicated, in FILTER_KEYS order so equal sets make equal cache keys. */
export function normalizeDrops(values: readonly string[]): FilterKey[] {
  const wanted = new Set(values.map((v) => v.trim()).filter(isFilterKey));
  return FILTER_KEYS.filter((key) => wanted.has(key));
}

export function parseSearchUrl(params: URLSearchParams): SearchUrlState {
  const type = params.get("type");
  const drop = params.get("drop");
  return {
    q: normalizeSearchQuery(params.get("q")),
    tab: isTab(type) ? type : "all",
    drop: drop ? normalizeDrops(drop.split(",")) : [],
  };
}

/** Defaults are omitted, so a plain search is still just `?q=`. */
export function writeSearchUrl(state: SearchUrlState): URLSearchParams {
  const params = new URLSearchParams();
  const q = normalizeSearchQuery(state.q);
  if (q) params.set("q", q);
  if (state.tab !== "all") params.set("type", state.tab);
  const drop = normalizeDrops(state.drop);
  if (drop.length > 0) params.set("drop", drop.join(","));
  return params;
}

/**
 * A new query starts from what the visitor typed: removed filters belonged to
 * the old query's reading and are cleared. The tab is kept, since someone
 * looking at Events who searches again still wants events.
 */
export function withQuery(state: SearchUrlState, q: string): SearchUrlState {
  return { q: normalizeSearchQuery(q), tab: state.tab, drop: [] };
}

export function withTab(state: SearchUrlState, tab: SearchTab): SearchUrlState {
  return { ...state, tab };
}

export function withDrop(state: SearchUrlState, key: FilterKey): SearchUrlState {
  return { ...state, drop: normalizeDrops([...state.drop, key]) };
}

/** The result type a tab shows, or null for "all". */
export function tabResultType(tab: SearchTab): SearchResultType | null {
  return tab === "all" ? null : TAB_TYPES[tab];
}

export function resultTypeTab(type: SearchResultType): Exclude<SearchTab, "all"> {
  switch (type) {
    case "events":
      return "events";
    case "restaurants":
      return "restaurants";
    case "attractions":
      return "places";
    case "hotels":
      return "stay";
  }
}

export function searchHref(state: SearchUrlState): string {
  const qs = writeSearchUrl(state).toString();
  return qs ? `/search?${qs}` : "/search";
}
