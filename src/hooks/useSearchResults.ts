/**
 * /search data (search plan WP2 items 2, 3 and 5).
 *
 * TWO LEGS, ONE PAGE.
 *   - The keyword leg (useKeywordResults) runs the hub hooks' own indexed
 *     search as soon as the query is valid, so the page paints real matches
 *     while the model reads the query.
 *   - The understood leg (useSearchResults) calls nlp-search through useQuery,
 *     keyed on the normalized query. The key is what ties results to the URL:
 *     a slow response for an old query lands in the old query's cache entry and
 *     cannot overwrite the new one, and Back renders from cache without a
 *     second model call. It used to be a useMutation, which did both wrong.
 *
 * Removing a chip re-queries with `intent` set to the cached parse minus that
 * facet. nlp-search skips the model when `intent` is present (WP1 item 10), so
 * a removal costs a database read, not a Claude call. Only a response that
 * reports `appliedFilters` came from a function that honours `intent`, so an
 * older deployment is never sent one.
 *
 * Every field WP1 adds (appliedFilters, unappliedFilters, matchType, degraded,
 * errors, results.hotels) is optional here, so this works against the function
 * deployed today and against WP1's.
 */
import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEvents } from "@/hooks/useEvents";
import { useRestaurants } from "@/hooks/useRestaurants";
import { useAttractions } from "@/hooks/useAttractions";
import { useHotels } from "@/hooks/useHotels";
import { loosenQuery, type ParsedSearchIntent } from "@/hooks/useNLPSearch";
import { sanitizePostgrestPattern } from "@/lib/postgrestPattern";
import type { SearchResultType } from "@/lib/searchResultHref";
import { isSearchableQuery, normalizeSearchQuery, type FilterKey } from "@/lib/searchUrlState";

/** Every type /search asks for. The deployed function ignores `hotels`; WP1's answers it. */
export const SEARCH_TYPES: readonly SearchResultType[] = ["events", "restaurants", "attractions", "hotels"];

/** nlp-search returns at most this many rows per type. A section at the cap is "Top 20", not "20". */
export const NLP_TYPE_LIMIT = 20;

/** How many rows each keyword-leg hook asks for. */
export const KEYWORD_TYPE_LIMIT = 12;

const TEN_MINUTES = 10 * 60_000;

/**
 * One result row as it arrives: raw table columns, snake_case, from either
 * nlp-search (`select('*')`) or a hub hook's projection. Every column is
 * optional because neither projection is a contract this page can rely on.
 */
export interface SearchRow {
  id: string;
  title?: string | null;
  name?: string | null;
  slug?: string | null;
  image_url?: string | null;
  description?: string | null;
  enhanced_description?: string | null;
  original_description?: string | null;
  short_description?: string | null;
  date?: string | null;
  event_start_utc?: string | null;
  event_start_local?: string | null;
  time_tbd?: boolean | null;
  venue?: string | null;
  location?: string | null;
  category?: string | null;
  price?: string | null;
  price_range?: string | null;
  cuisine?: string | null;
  status?: string | null;
  opening_date?: string | null;
  type?: string | null;
  is_free?: boolean | null;
  area?: string | null;
  city?: string | null;
  avg_nightly_rate?: number | string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface AppliedFilter {
  key: FilterKey;
  label: string;
  /** Content types nlp-search applied this filter to (absent on older deployments). */
  types?: string[];
}

/** The parse, with contentTypes widened to include hotels (WP1 item 9). */
export type SearchIntent = Omit<ParsedSearchIntent, "contentTypes"> & { contentTypes: string[] };

export type SearchResultsByType = Partial<Record<SearchResultType, SearchRow[]>>;

export interface NLPSearchBody {
  success: boolean;
  query?: string;
  parsedIntent?: SearchIntent;
  results?: SearchResultsByType;
  appliedFilters?: AppliedFilter[];
  unappliedFilters?: string[];
  matchType?: "understood" | "keyword";
  degraded?: boolean;
  code?: string;
  /** Per-type failure codes, so "none" and "failed" read differently. */
  errors?: Partial<Record<SearchResultType, string>>;
  error?: string;
}

/**
 * The cached parse minus the facets the visitor removed. Each key clears every
 * intent field that could have produced it, so a removed "Tonight" cannot come
 * back through timeOfDay.
 */
export function intentWithout(
  intent: SearchIntent,
  drops: readonly FilterKey[],
  types: readonly SearchResultType[] = SEARCH_TYPES,
): SearchIntent {
  const next: SearchIntent = { ...intent };
  for (const key of drops) {
    switch (key) {
      case "type":
        next.contentTypes = [...types];
        break;
      case "when":
        next.dateFilter = undefined;
        next.specificDate = undefined;
        next.timeOfDay = undefined;
        break;
      case "price":
        next.priceRange = undefined;
        next.maxBudget = undefined;
        break;
      case "budget":
        next.maxBudget = undefined;
        break;
      case "area":
        next.location = undefined;
        next.neighborhood = undefined;
        next.nearDowntown = undefined;
        break;
      case "cuisine":
        next.cuisine = undefined;
        break;
      case "category":
        next.category = undefined;
        break;
      case "kid":
        next.kidFriendly = undefined;
        next.familyFriendly = undefined;
        break;
      case "keywords":
        next.keywords = [];
        break;
    }
  }
  return next;
}

function isAppliedFilterList(value: unknown): value is AppliedFilter[] {
  return (
    Array.isArray(value) &&
    value.every(
      (f) => f && typeof f === "object" && typeof f.key === "string" && typeof f.label === "string",
    )
  );
}

/** Tolerates a body from any deployment: drops what is malformed instead of trusting it. */
export function readNLPBody(raw: unknown): NLPSearchBody {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const results = (body.results && typeof body.results === "object" ? body.results : {}) as Record<
    string,
    unknown
  >;
  const rows = (value: unknown): SearchRow[] | undefined =>
    Array.isArray(value) ? (value.filter((r) => r && typeof r === "object" && "id" in r) as SearchRow[]) : undefined;

  const byType: SearchResultsByType = {};
  for (const type of SEARCH_TYPES) {
    const list = rows(results[type]);
    if (list) byType[type] = list;
  }

  return {
    success: body.success === true,
    query: typeof body.query === "string" ? body.query : undefined,
    parsedIntent:
      body.parsedIntent && typeof body.parsedIntent === "object"
        ? (body.parsedIntent as SearchIntent)
        : undefined,
    results: byType,
    appliedFilters: isAppliedFilterList(body.appliedFilters) ? body.appliedFilters : undefined,
    unappliedFilters: Array.isArray(body.unappliedFilters)
      ? body.unappliedFilters.filter((s): s is string => typeof s === "string" && s.length > 0)
      : undefined,
    matchType: body.matchType === "understood" || body.matchType === "keyword" ? body.matchType : undefined,
    degraded: body.degraded === true,
    code: typeof body.code === "string" ? body.code : undefined,
    errors:
      body.errors && typeof body.errors === "object"
        ? (body.errors as Partial<Record<SearchResultType, string>>)
        : undefined,
    error: typeof body.error === "string" ? body.error : undefined,
  };
}

async function invokeNlpSearch(
  body: { query: string; contentTypes: readonly SearchResultType[]; intent?: SearchIntent },
  signal: AbortSignal,
): Promise<NLPSearchBody> {
  const { data, error } = await supabase.functions.invoke("nlp-search", { body, signal });
  if (error) throw error;
  const parsed = readNLPBody(data);
  if (!parsed.success) throw new Error(parsed.error || "nlp-search returned success: false");
  return parsed;
}

export interface SearchResultsState {
  /**
   * The response for the current query and drops, or null while none has
   * arrived. While a chip removal re-queries, this is the unfiltered response
   * and isPending is true.
   */
  data: NLPSearchBody | null;
  /** True while the response for the current query and drops is on its way. */
  isPending: boolean;
  isError: boolean;
  error: unknown;
  /** Drops the response actually honours; empty when the deployment cannot. */
  appliedDrops: FilterKey[];
  refetch: () => void;
}

/**
 * The understood leg. `q` is normalized here as well as in the URL helper so a
 * caller cannot make two cache entries out of one query.
 */
export function useSearchResults(
  rawQuery: string,
  drops: readonly FilterKey[] = [],
  types: readonly SearchResultType[] = SEARCH_TYPES,
): SearchResultsState {
  const q = normalizeSearchQuery(rawQuery);
  const enabled = isSearchableQuery(q);

  const base = useQuery({
    queryKey: ["nlp-search", q, types, null],
    queryFn: ({ signal }) => invokeNlpSearch({ query: q, contentTypes: types }, signal),
    enabled,
    staleTime: TEN_MINUTES,
    gcTime: 3 * TEN_MINUTES,
    retry: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  // keepPreviousData hands back the OLD query's body while the new one loads.
  // It must never be read as this query's answer, or the page would show last
  // search's results under this search's heading.
  const baseData = base.isPlaceholderData ? null : base.data ?? null;
  const honoursIntent = Boolean(baseData?.appliedFilters && baseData.parsedIntent);
  const dropKey = honoursIntent ? [...drops] : [];

  const overrideIntent = useMemo(
    () =>
      dropKey.length > 0 && baseData?.parsedIntent
        ? intentWithout(baseData.parsedIntent, dropKey, types)
        : null,
    // dropKey is rebuilt every render; its joined form is the stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseData, dropKey.join(","), types],
  );

  const override = useQuery({
    queryKey: ["nlp-search", q, types, { drop: dropKey }],
    queryFn: ({ signal }) =>
      invokeNlpSearch({ query: q, contentTypes: types, intent: overrideIntent ?? undefined }, signal),
    enabled: enabled && overrideIntent !== null,
    staleTime: TEN_MINUTES,
    gcTime: 3 * TEN_MINUTES,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const refetchBase = base.refetch;
  const refetchOverride = override.refetch;

  if (overrideIntent) {
    return {
      // While the narrower re-query runs, the unfiltered answer stays on screen
      // (marked busy) instead of dropping back to keyword matches.
      data: override.data ?? baseData,
      isPending: override.isPending,
      isError: override.isError,
      error: override.error,
      appliedDrops: dropKey,
      refetch: () => void refetchOverride(),
    };
  }

  return {
    data: baseData,
    isPending: enabled && (base.isPending || base.isPlaceholderData),
    isError: base.isError && !base.isPlaceholderData,
    error: base.error,
    appliedDrops: [],
    refetch: () => void refetchBase(),
  };
}

export interface KeywordResultsState {
  results: Record<SearchResultType, SearchRow[]>;
  isLoading: boolean;
  /** The term the hub hooks were given (loosened), for the "Keyword matches for" line. */
  term: string;
  refetch: () => void;
}

/**
 * The keyword leg: the hubs' own indexed search (events FTS plus fuzzy,
 * restaurants FTS, attractions and hotels ILIKE).
 *
 * MOUNT ONLY WITH A SEARCHABLE QUERY. The hub hooks take no `enabled` flag, and
 * given an empty search they list everything, which is not a search result.
 *
 * The query is loosened first: websearch_to_tsquery ANDs every word, so "live
 * music tonight" would require "tonight" in the event text.
 */
export function useKeywordResults(rawQuery: string): KeywordResultsState {
  const q = normalizeSearchQuery(rawQuery);
  const term = loosenQuery(q) ?? q;
  // attractions and hotels interpolate into or(...). useAttractions sanitizes
  // on its own; useHotels does not, so it gets the sanitized term here. A term
  // that sanitizes to nothing would make both list every row, so their rows
  // are ignored in that case.
  const pattern = sanitizePostgrestPattern(term);

  const events = useEvents({ search: term, limit: KEYWORD_TYPE_LIMIT });
  const restaurants = useRestaurants({ search: term, limit: KEYWORD_TYPE_LIMIT });
  const attractions = useAttractions({ search: term, limit: KEYWORD_TYPE_LIMIT });
  const hotels = useHotels({ search: pattern || term, limit: KEYWORD_TYPE_LIMIT });

  const results = useMemo(
    () => ({
      events: events.events as unknown as SearchRow[],
      restaurants: restaurants.restaurants as unknown as SearchRow[],
      attractions: pattern ? (attractions.attractions as unknown as SearchRow[]) : [],
      hotels: pattern ? ((hotels.hotels ?? []) as unknown as SearchRow[]) : [],
    }),
    [events.events, restaurants.restaurants, attractions.attractions, hotels.hotels, pattern],
  );

  const refetchEvents = events.refetch;
  const refetchRestaurants = restaurants.refetch;
  const refetchAttractions = attractions.refetch;

  return {
    results,
    isLoading: events.isLoading || restaurants.isLoading || attractions.isLoading || hotels.isLoading,
    term,
    refetch: () => {
      void refetchEvents();
      void refetchRestaurants();
      void refetchAttractions();
    },
  };
}
