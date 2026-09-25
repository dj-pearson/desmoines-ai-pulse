/**
 * One reader for every saved_searches row, whatever wrote it
 * (docs/page-plans/search.md WP3 item 1).
 *
 * Three shapes share the table:
 * - web `event_list`, written by create_event_saved_search from /events and
 *   /search: `{ q, category, location, price, preset, sort }`, where
 *   `location` is an area slug from src/lib/eventAreas.ts;
 * - iOS, inserted directly: `{ query, tab, alerts_enabled }`, `event_list` for
 *   the Events tab and `advanced` for every other tab
 *   (ios/DesMoinesInsider/Services/SavedSearchService.swift);
 * - web `/search/advanced`: the AdvancedSearchFilters object (`query`,
 *   `category`, `location`, `features`, ...), stored as `advanced`.
 *
 * Every field is read with a fallback, so a row missing any key, or with
 * `filters` null, a string or an array, still normalizes. Nothing here throws.
 */
import { z } from "zod";
import { findEventArea } from "@/lib/eventAreas";
import { FALLBACK_CATEGORY, normalizeCategory } from "@/lib/eventCategories";

/** The list-page filter keys we persist and deep-link back to (WEB-UX-001). */
export const SAVED_SEARCH_FILTER_KEYS = ["q", "category", "location", "price", "preset", "sort"] as const;
export type SavedSearchFilterKey = (typeof SAVED_SEARCH_FILTER_KEYS)[number];
export type SavedSearchFilters = Partial<Record<SavedSearchFilterKey, string>>;

/** Placeholder values the /events controls use for "no filter". */
const UNSET_VALUES = new Set(["", "all", "any-location", "any-price", "any"]);

function isSet(value: string | undefined): value is string {
  return !!value && !UNSET_VALUES.has(value.trim().toLowerCase());
}

/** Build a shareable /events deep link from saved filters. */
export function buildSavedSearchUrl(filters: SavedSearchFilters): string {
  const params = new URLSearchParams();
  for (const key of SAVED_SEARCH_FILTER_KEYS) {
    const v = filters[key];
    if (isSet(v)) params.set(key, v.trim());
  }
  const qs = params.toString();
  return `/events${qs ? `?${qs}` : ""}`;
}

/** A string, or "" for anything else (numbers, arrays, null, missing). */
const text = z
  .unknown()
  .transform((v) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : ""));

const filtersSchema = z.preprocess(
  (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {}),
  z.object({
    q: text,
    query: text,
    category: text,
    location: text,
    price: text,
    preset: text,
    sort: text,
    tab: text,
  }),
);

export type SavedSearchKind = "events" | "other";

export interface NormalizedSavedSearch {
  /** "events" rows are the ones the nightly alert job scans. */
  kind: SavedSearchKind;
  q: string;
  category: string;
  location: string;
  price: string;
  preset: string;
  sort: string;
  /** Where "Open" goes: /events with the filters, or /search?q= for the rest. */
  href: string;
  /** One line for the dashboard, e.g. "'jazz' - West Des Moines - Free". */
  label: string;
}

/** The parts of a saved_searches row this reads. Extra columns are ignored. */
export interface SavedSearchRowLike {
  filters?: unknown;
  search_type?: string | null;
}

/** iOS tab names and advanced-search categories, as /search `type=` values. */
const SEARCH_TYPE_BY_NAME: Record<string, string> = {
  events: "events",
  restaurants: "restaurants",
  attractions: "places",
  places: "places",
  hotels: "stay",
  stay: "stay",
};

function searchHref(q: string, typeName: string): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  const type = SEARCH_TYPE_BY_NAME[typeName.toLowerCase()];
  if (type) params.set("type", type);
  const qs = params.toString();
  return `/search${qs ? `?${qs}` : ""}`;
}

function humanize(value: string): string {
  const spaced = value.replace(/[-_]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function kindOf(searchType: string | null | undefined, tab: string): SavedSearchKind {
  if (searchType === "event_list") return "events";
  if (searchType) return "other";
  // No column value (a hand-built row): the iOS Events tab is the only
  // foreign shape that means events.
  return tab.toLowerCase() === "events" ? "events" : "other";
}

export function normalizeSavedSearch(row: SavedSearchRowLike | null | undefined): NormalizedSavedSearch {
  const f = filtersSchema.parse(row?.filters);
  const kind = kindOf(row?.search_type, f.tab);
  // iOS writes `query`; the web writes `q`. The web key wins when both exist.
  const q = f.q || f.query;
  const category = isSet(f.category) ? f.category : "";
  const location = isSet(f.location) ? f.location : "";
  const price = isSet(f.price) ? f.price : "";
  const preset = isSet(f.preset) ? f.preset : "";
  const sort = isSet(f.sort) ? f.sort : "";

  if (kind === "events") {
    const parts: string[] = [];
    if (q) parts.push(`'${q}'`);
    if (category) parts.push(category);
    if (location) parts.push(findEventArea(location)?.label ?? location);
    if (price) parts.push(price.toLowerCase() === "free" ? "Free" : humanize(price));
    if (preset) parts.push(humanize(preset));
    return {
      kind,
      q,
      category,
      location,
      price,
      preset,
      sort,
      href: buildSavedSearchUrl({ q, category, location, price, preset, sort }),
      label: parts.length ? parts.join(" - ") : "Every new event",
    };
  }

  const typeName = f.tab || category;
  const parts: string[] = [];
  if (q) parts.push(`'${q}'`);
  if (typeName) parts.push(typeName);
  if (location) parts.push(location);
  return {
    kind,
    q,
    category,
    location,
    price,
    preset,
    sort,
    href: searchHref(q, typeName),
    label: parts.length ? parts.join(" - ") : "Any search",
  };
}

// ---------------------------------------------------------------------------
// Watching a /search (search.md WP3 item 2)
// ---------------------------------------------------------------------------

/** One entry of nlp-search's `appliedFilters`. `types` is optional: older deploys omit it. */
export interface WatchSearchAppliedFilter {
  key: string;
  label: string;
  types?: readonly string[];
}

export interface WatchSearchPlan {
  filters: SavedSearchFilters;
  /** "New events matching 'jazz', free only." */
  covers: string;
  /** Labels of applied filters the alert cannot carry. */
  notCovered: string[];
}

/**
 * What an alert on this search saves: the keys the nightly job matches (q,
 * category, price=free), and the labels of the search's other filters, which
 * the dialog names as not part of the alert.
 */
export function planWatchedSearch(
  query: string,
  appliedFilters: readonly WatchSearchAppliedFilter[],
): WatchSearchPlan {
  const forEvents = (f: WatchSearchAppliedFilter) => !f.types || f.types.includes("events");
  const eventFilters = appliedFilters.filter(forEvents);

  // nlp-search labels the keyword chip with the tokens in double quotes.
  const keywordChips = eventFilters.filter((f) => f.key === "keywords");
  const keywords = keywordChips
    .map((f) => f.label.replace(/^["'\s]+|["'\s]+$/g, ""))
    .filter(Boolean);
  const q = (appliedFilters.length > 0 ? keywords.join(" ") : query).trim().replace(/\s+/g, " ");

  // nlp-search's category chip is the model's own word, applied as a
  // substring ("music" matches "Live Music"). The nightly job and the /events
  // hub compare the stored canonical category exactly, so save the canonical
  // value; a word that maps to none is named as not part of the alert.
  const categoryChip = eventFilters.find((f) => f.key === "category");
  const canonical = categoryChip ? normalizeCategory(categoryChip.label) : FALLBACK_CATEGORY;
  const category = canonical === FALLBACK_CATEGORY ? "" : canonical;
  const free = eventFilters.some((f) => f.key === "price" && f.label.trim().toLowerCase() === "free");

  const filters: SavedSearchFilters = {};
  if (q) filters.q = q;
  if (category) filters.category = category;
  if (free) filters.price = "free";

  const notCovered = eventFilters
    .filter(
      (f) =>
        !["keywords", "type"].includes(f.key) &&
        !(f.key === "category" && category) &&
        !(f.key === "price" && free),
    )
    .map((f) => f.label)
    .filter((label, i, all) => label && all.indexOf(label) === i);

  let covers = category ? `New ${category} events` : "New events";
  if (q) covers += ` matching '${q}'`;
  if (free) covers += ", free only";

  return { filters, covers: `${covers}.`, notCovered };
}

/** Human summary of an /events saved search's filters. */
export function describeSavedSearch(filters: SavedSearchFilters | null | undefined): string {
  return normalizeSavedSearch({ search_type: "event_list", filters }).label;
}
