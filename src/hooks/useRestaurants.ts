import { useCallback } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type Query,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { getRestaurantRotationSeed } from "@/lib/restaurantRotation";
import { RESTAURANT_LIST_COLUMNS, withAdminColumns } from "@/lib/listColumns";
import { STALE_TIME, GC_TIME } from "@/lib/queryConfig";
import { queryKeys } from "@/lib/queryKeys";
import { createLogger } from "@/lib/logger";
import { hubSearchQuery } from "@/components/events/eventsHubQuery";
// One rule for "can you eat here" (eat-drink pass 2 WP2 item 4). It counts
// `announced`, which the local set here left out.
import { isVisitableStatus } from "@/lib/restaurantHours";

const logger = createLogger("useRestaurants");

type Restaurant = Database["public"]["Tables"]["restaurants"]["Row"];
type RestaurantInsert = Database["public"]["Tables"]["restaurants"]["Insert"];
type RestaurantUpdate = Database["public"]["Tables"]["restaurants"]["Update"];

export interface RestaurantFilters {
  search?: string;
  cuisine?: string[];
  priceRange?: string[];
  rating?: number[];
  location?: string[];
  sortBy?:
    | "popularity"
    | "rating"
    | "newest"
    | "alphabetical"
    | "price_low"
    | "price_high";
  featuredOnly?: boolean;
  /**
   * Only currently-active sponsored listings (WEB-PERF-029).
   *
   * Exists so paid placement survives server-side pagination. arrangeSponsored
   * boosts up to two sponsored rows to the top of whatever array it is given,
   * which worked only because the page fetched EVERY restaurant -- a sponsored
   * listing ranked 400th by rotation was still pulled onto page 1. Bounding the
   * fetch would have silently ended that, which is a contract question and not
   * a performance decision, so the page now fetches those rows on their own.
   */
  sponsoredOnly?: boolean;
  openNow?: boolean;
  tags?: string[];
  dietary?: string[];
  limit?: number;
  offset?: number;
  /**
   * Ask for the admin-only columns as well (WEB-PERF-035). Only
   * /admin/content sets it: ai_writeup is a 250-350 word paragraph per row and
   * the only thing that reads it is ContentTable's "has a writeup" tick.
   *
   * The whole filters object is the query key here, so setting this already
   * produces its own cache entry.
   */
  includeAdminFields?: boolean;
}

export interface UseRestaurantsOptions {
  /**
   * False skips the request (eat-drink pass 2 WP1 item 8). Additive: every
   * existing caller leaves it out and keeps fetching. The hub passes it so
   * desktop pages 2+ do not read sponsors they will never show, and so the
   * desktop and mobile list queries are not both in flight.
   */
  enabled?: boolean;
}

/** Full rating range — i.e. the user has not actually narrowed by rating.
 *
 *  Sending these bounds anyway is not harmless (WEB-QA-011). The filter compares
 *  `rating >= min AND rating <= max`, and for a restaurant with a NULL rating
 *  both comparisons evaluate to NULL, so the row is dropped. The default [0, 5]
 *  therefore silently excluded every unrated restaurant — 46 of 480 (~10%),
 *  which are disproportionately the newest listings. Treat the full range as
 *  "no filter" and send NULL so the predicate is skipped entirely.
 */
const RATING_MIN = 0;
const RATING_MAX = 5;

// Type predicate, not a plain boolean: callers index `rating[0]`/`rating[1]`
// straight after this check, and under strictNullChecks a boolean return would
// not narrow `number[] | undefined`. Narrowing to a fixed-length tuple lets that
// indexing typecheck without a non-null assertion.
function hasRatingFilter(
  rating: number[] | undefined
): rating is [number, number] {
  if (!rating || rating.length !== 2) return false;
  return rating[0] > RATING_MIN || rating[1] < RATING_MAX;
}

/**
 * Sink not-yet-open and closed venues below the ones a visitor can visit now,
 * preserving relative order within each group (WEB-QA-004).
 *
 * The default sort routes through `get_rotated_restaurants`, which deliberately
 * shuffles by a rotation seed so the top of the list isn't identical on every
 * visit. That shuffle ignores `status`, so "Opening Soon" venues regularly
 * landed in the first row of cards — the QA pass saw three of them leading the
 * list. This is a stable partition rather than a re-sort, so the rotation's
 * variety is kept intact within each group.
 *
 * Done client-side on purpose: the ordering lives in the RPC, and changing that
 * is a migration. This needs no schema change and no shape change.
 */
function deprioritizeUnvisitable(list: Restaurant[]): Restaurant[] {
  const visitable: Restaurant[] = [];
  const unvisitable: Restaurant[] = [];
  for (const r of list) {
    const status = (r as { status?: string | null }).status;
    (isVisitableStatus(status) ? visitable : unvisitable).push(r);
  }
  return [...visitable, ...unvisitable];
}

/**
 * Rows whose name starts with the typed term first, everything else in the
 * order the query returned it (eat-drink pass 2 WP1 item 6). A visitor who
 * typed "harb" is looking for Harbinger, not for the highest-rated row that
 * happens to mention a harbor. Only the first word-run of the name counts, and
 * only on page 1: re-ordering a later page would move rows across pages.
 */
export function floatNamePrefixMatches<T extends { name?: string | null }>(
  rows: readonly T[],
  term: string
): T[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return [...rows];
  const starts: T[] = [];
  const rest: T[] = [];
  for (const row of rows) {
    ((row.name ?? "").trim().toLowerCase().startsWith(needle) ? starts : rest).push(row);
  }
  return [...starts, ...rest];
}

/** A restaurant the fuzzy matcher thinks the visitor meant. */
export interface RestaurantSuggestion {
  id: string;
  name: string;
  slug: string | null;
}

export interface RestaurantListResult {
  restaurants: Restaurant[];
  totalCount: number;
  /** Did-you-mean names, only when a search matched nothing. Never swapped in as results. */
  suggestions: RestaurantSuggestion[];
}

const SUGGESTION_LIMIT = 5;

/**
 * PostgREST's "no such function" (PGRST202) and Postgres's (42883). The only
 * rotation-RPC errors that fall back to the table query (eat-drink pass 2 WP1
 * item 5). Anything else is an outage, and answering it with a second,
 * differently ordered query hid it from ErrorState.
 */
const MISSING_FUNCTION_CODES = new Set(["PGRST202", "42883"]);

export function isMissingFunctionError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && MISSING_FUNCTION_CODES.has(code);
}

/**
 * True when two list queries differ only in which page they ask for
 * (limit/offset). Those are the only transitions that keep the previous rows
 * on screen: a page change on desktop keeps the old page up until the new one
 * lands. A changed filter is a different result set, so it still shows the
 * loading state rather than the old rows under the new chips.
 */
export function isSameListExceptPaging(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined
): boolean {
  if (!a || !b) return false;
  const strip = (f: Record<string, unknown>) => {
    const rest = { ...f };
    delete rest.limit;
    delete rest.offset;
    return rest;
  };
  const x = strip(a);
  const y = strip(b);
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  for (const key of keys) {
    if (JSON.stringify(x[key]) !== JSON.stringify(y[key])) return false;
  }
  return true;
}

/**
 * Did-you-mean for a search that matched nothing, on either path.
 *
 * fuzzy_search_restaurants returns no slug (20260822000004:107) and knows
 * nothing of merges, so its ids are looked up again: slugs for the links, and
 * merged rows dropped (eat-drink pass 2 WP1 item 5). The fuzzy order is kept.
 * Any failure is an empty list: suggestions are a nicety, not a result.
 */
export async function fetchFuzzySuggestions(search: string): Promise<RestaurantSuggestion[]> {
  try {
    const { data, error } = await supabase.rpc("fuzzy_search_restaurants", {
      search_query: search,
      search_limit: SUGGESTION_LIMIT * 2,
    });
    if (error || !Array.isArray(data)) return [];
    const ids = (data as unknown as Array<{ id?: unknown }>)
      .map((r) => (typeof r?.id === "string" ? r.id : null))
      .filter((id): id is string => !!id);
    if (ids.length === 0) return [];

    const { data: rows, error: lookupError } = await supabase
      .from("restaurants")
      .select("id,slug,name")
      .in("id", ids)
      .neq("is_merged", true)
      .returns<Array<{ id: string; slug: string | null; name: string | null }>>();
    if (lookupError || !Array.isArray(rows)) return [];

    const byId = new Map(rows.filter((r) => r?.id && r?.name).map((r) => [r.id, r]));
    return ids
      .map((id) => byId.get(id))
      .filter((r): r is { id: string; slug: string | null; name: string } => !!r && !!r.name)
      .slice(0, SUGGESTION_LIMIT)
      .map((r) => ({ id: r.id, name: r.name, slug: r.slug ?? null }));
  } catch (err) {
    logger.debug("fetchFuzzySuggestions", "fuzzy suggestions unavailable", { error: err });
    return [];
  }
}

interface FetchListOptions {
  /** Rotation seed for the default sort. Defaults to today's Des Moines seed. */
  seed?: number;
}

type RotationRpc = (
  fn: string,
  args: Record<string, unknown>
) => Promise<{
  data: Array<{ restaurant_data: Restaurant; total_count: number | string }> | null;
  error: { message: string; code?: string } | null;
}>;

/**
 * One page of the restaurant list. The query the hub, the admin table and
 * site search all read, as a plain function so the infinite list (mobile) and
 * the paged one (desktop) share every rule.
 */
export async function fetchRestaurantList(
  filters: RestaurantFilters,
  options: FetchListOptions = {}
): Promise<RestaurantListResult> {
  try {
    // Default popularity sort goes through the rotation RPC so the top of
    // the list isn't the same every visit.
    //
    // sponsoredOnly forces the legacy path: get_rotated_restaurants has no
    // sponsorship parameter, and adding one would change a signature three
    // shipped clients call. Other sorts (rating, newest, A-Z,
    // price) stay deterministic — users picked them explicitly.
    // Dietary filtering still runs via the regular query path because the
    // RPC doesn't model the description/cuisine ILIKE fan-out.
    //
    // A SEARCH ALSO TAKES THE TABLE PATH (eat-drink pass 2 WP1 item 6). The
    // RPC runs websearch_to_tsquery, which needs whole words, so "harb" found
    // nothing while the autocomplete above the box offered Harbinger. The
    // table path sends hubSearchQuery's prefix tsquery. A ranked RPC version
    // is WP5's migration.
    const sortBy = filters.sortBy || "popularity";
    const dietarySelections = resolveDietarySelections(filters);
    const search = filters.search?.trim() ?? "";
    const useRotationRpc =
      sortBy === "popularity" &&
      !filters.sponsoredOnly &&
      dietarySelections.length === 0 &&
      !search;

    if (useRotationRpc) {
      const limit = filters.limit ?? 1000;
      const offset = filters.offset ?? 0;
      // Cast: get_rotated_restaurants is added in a new migration and is
      // not yet in the generated Database types.
      const { data: rpcData, error: rpcError } = await (supabase.rpc as unknown as RotationRpc)(
        "get_rotated_restaurants",
        {
          rotation_seed: options.seed ?? getRestaurantRotationSeed(),
          search_query: null,
          cuisine_filter:
            filters.cuisine && filters.cuisine.length > 0 ? filters.cuisine : null,
          price_filter:
            filters.priceRange && filters.priceRange.length > 0 ? filters.priceRange : null,
          location_filter:
            filters.location && filters.location.length > 0 ? filters.location : null,
          min_rating: hasRatingFilter(filters.rating) ? filters.rating[0] : null,
          max_rating: hasRatingFilter(filters.rating) ? filters.rating[1] : null,
          featured_only: !!filters.featuredOnly,
          limit_count: limit,
          offset_count: offset,
        }
      );

      if (!rpcError && rpcData) {
        return {
          suggestions: [],
          restaurants: deprioritizeUnvisitable(
            // .filter(Boolean) because the cast below is a promise, not a
            // check. A row whose restaurant_data is absent maps to undefined
            // and the very next thing that happens is `r.status` in
            // deprioritizeUnvisitable, which throws and drops the WHOLE page
            // to "Something went wrong" - the same thing a visitor sees when
            // the backend is down. Found while giving the E2E specs a fixture
            // backend (WEB-CI-028): one row of the wrong shape, and the page
            // reported an outage.
            rpcData.map((r) => r.restaurant_data).filter(Boolean) as unknown as Restaurant[]
          ),
          totalCount: rpcData.length > 0 ? Number(rpcData[0].total_count) : 0,
        };
      }
      // Only a missing function falls through to the table query, so the
      // page still renders where the migration has not been applied. A
      // timeout or a 500 is thrown and reaches ErrorState.
      if (rpcError && !isMissingFunctionError(rpcError)) throw rpcError;
      logger.warn("fetchRestaurants", "rotation RPC missing, falling back to direct query", {
        error: rpcError,
      });
    }

    let query = supabase
      .from("restaurants")
      // Project only the card/list fields (WEB-PERF-009) — drops heavy
      // SEO/GEO/tsvector/geometry columns the list never renders.
      //
      // Count is "estimated", not "planned" (WEB-QA-004). A "planned" count is
      // purely the planner's row estimate and comes back NULL whenever the
      // planner has no usable statistic for the filtered query — which is why
      // the results header rendered a blank number before "found". "estimated"
      // returns an exact count under PostgREST's threshold and falls back to
      // the planner estimate only for large result sets, so it keeps the
      // WEB-PERF-009 intent (no forced full-table count on every filter/sort)
      // while always yielding a number.
      .select(withAdminColumns(RESTAURANT_LIST_COLUMNS, filters.includeAdminFields), { count: "estimated" })
      .neq("is_merged", true); // Hide rows merged into a duplicate (WEB-AUTO-005)

    // Prefix full-text search: every word must match and the last one is a
    // prefix, so "harb" finds Harbinger. Quotes or OR go to websearch.
    const tsquery = hubSearchQuery(search);
    if (tsquery) {
      query = query.textSearch("search_vector", tsquery.query, {
        ...(tsquery.type ? { type: tsquery.type } : {}),
        config: "english",
      });
    }

    // Apply cuisine filter (array)
    if (filters.cuisine && filters.cuisine.length > 0) {
      query = query.in("cuisine", filters.cuisine);
    }

    // Apply price range filter (array)
    if (filters.priceRange && filters.priceRange.length > 0) {
      query = query.in("price_range", filters.priceRange);
    }

    // Apply rating filter. Same guard as the RPC path above — the default
    // [0, 5] must not be sent, or unrated restaurants get filtered out
    // (WEB-QA-011).
    if (hasRatingFilter(filters.rating)) {
      query = query.gte("rating", filters.rating[0]).lte("rating", filters.rating[1]);
    }

    // Apply location filter (array) - using location column for matches
    if (filters.location && filters.location.length > 0) {
      query = query.in("location", filters.location);
    }

    // Apply featured filter
    if (filters.featuredOnly) {
      query = query.eq("is_featured", true);
    }

    // WEB-PERF-029. Active sponsorships only: is_sponsored with either no
    // expiry or one in the future, which is the same rule isSponsoredActive
    // applies in the browser. Expressing it here rather than filtering after
    // the fetch is the whole point -- the page asks for ten rows instead of
    // reading four hundred to find them.
    if (filters.sponsoredOnly) {
      query = query
        .eq("is_sponsored", true)
        .or(`sponsored_until.is.null,sponsored_until.gt.${new Date().toISOString()}`);
    }

    // Apply dietary keyword filter (searches description and cuisine fields)
    if (dietarySelections.length > 0) {
      const orClauses = dietarySelections.flatMap((diet) => {
        const keywords = DIETARY_KEYWORDS[diet] || [diet];
        return keywords.flatMap((kw) => [
          `description.ilike.%${kw}%`,
          `cuisine.ilike.%${kw}%`,
          `name.ilike.%${kw}%`,
        ]);
      });
      query = query.or(orClauses.join(","));
    }

    switch (sortBy) {
      case "popularity":
        query = query
          .order("popularity_score", { ascending: false })
          .order("is_featured", { ascending: false })
          .order("created_at", { ascending: false });
        break;
      case "rating":
        query = query
          .order("rating", { ascending: false, nullsFirst: false })
          .order("popularity_score", { ascending: false });
        break;
      case "newest":
        // Shown as "Recently added": created_at is when the row was scraped,
        // not when the restaurant opened.
        query = query.order("created_at", { ascending: false });
        break;
      case "alphabetical":
        query = query.order("name", { ascending: true });
        break;
      case "price_low":
        query = query
          .order("price_range", { ascending: true, nullsFirst: false })
          .order("popularity_score", { ascending: false });
        break;
      case "price_high":
        query = query
          .order("price_range", { ascending: false, nullsFirst: false })
          .order("popularity_score", { ascending: false });
        break;
      default:
        query = query.order("popularity_score", { ascending: false });
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
    }

    // .returns<Restaurant[]> for the same reason as useEvents: the
    // projection comes from withAdminColumns() at runtime, so supabase-js
    // types the rows as GenericStringError[] and every later assignment
    // fails against it.
    const { data, error, count } = await query.returns<Restaurant[]>();

    if (error) {
      // PGRST103 is an offset past the last row: a stale ?page=40 link, not
      // an outage. An empty page lets the hub say "past the end".
      if ((error as { code?: string }).code === "PGRST103") {
        return { restaurants: [], totalCount: 0, suggestions: [] };
      }
      throw error;
    }

    const rows =(data || []) as unknown as Restaurant[];

    // A search that matched nothing gets did-you-mean links, never results
    // (eat-drink pass 2 WP1 item 5). This path used to swap the fuzzy rows
    // in as the list, and fuzzy_search_restaurants ignores cuisine, price,
    // rating, merges and closures, so "tacos" under Thai + highest rated
    // showed any taco place at all with a count of however many it found.
    // Never for sponsoredOnly: the hub boosts whatever that query returns.
    const suggestions =
      rows.length === 0 && search && !filters.sponsoredOnly && !filters.offset
        ? await fetchFuzzySuggestions(search)
        : [];

    const ordered = search && !filters.offset ? floatNamePrefixMatches(rows, search) : rows;

    return {
      restaurants: deprioritizeUnvisitable(ordered),
      totalCount: count || 0,
      suggestions,
    };
  } catch (error) {
    logger.error("fetchRestaurants", "Error fetching restaurants", { error });
    // Rethrown rather than swallowed into local state: TanStack owns `error`
    // now, and a query that resolves with an empty list is otherwise
    // indistinguishable from one that failed.
    throw error;
  }
}

function errorMessage(error: unknown): string | null {
  if (!error) return null;
  return error instanceof Error ? error.message : "Failed to fetch restaurants";
}

export function useRestaurants(filters: RestaurantFilters = {}, options: UseRestaurantsOptions = {}) {
  const queryClient = useQueryClient();

  // WEB-PERF-028. This was useState + useEffect, so nothing was cached across
  // navigation and every mount refetched -- including the rotation RPC, which
  // is the more expensive of the two paths below. It also made the route
  // invisible to PrerenderSignal, which publishes data-queries-settled from
  // useIsFetching(): a count of TanStack queries only. A hook outside that
  // count reports settled while its request is still in flight, which is how
  // prerender.mjs captured a skeleton on 2 of 4 builds.
  //
  // The generic is explicit on purpose. Inferring it from the return would
  // narrow `restaurants` to whatever the last branch produced rather than the
  // table Row, and every caller that reads a column the projection omits would
  // stop compiling.
  const { data, isLoading, isFetching, isPlaceholderData, error } = useQuery<RestaurantListResult>({
    queryKey: queryKeys.restaurants.list(filters as Record<string, unknown>),
    staleTime: STALE_TIME.CONTENT_LIST,
    gcTime: GC_TIME,
    enabled: options.enabled ?? true,
    // Keep the loaded rows while the next page loads (plan WP2 item 8), but
    // only across a page change; see isSameListExceptPaging.
    placeholderData: (previous: RestaurantListResult | undefined, previousQuery?: Query<RestaurantListResult>) =>
      previous &&
      isSameListExceptPaging(
        previousQuery?.queryKey?.[2] as Record<string, unknown> | undefined,
        filters as Record<string, unknown>
      )
        ? previous
        : undefined,
    queryFn: () => fetchRestaurantList(filters),
  });

  /** Re-run this list. The mutations below call it so a write shows immediately. */
  const fetchRestaurants = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.restaurants.lists() });
  }, [queryClient]);


  const createRestaurant = async (restaurant: RestaurantInsert) => {
    try {
      const { data, error } = await supabase
        .from("restaurants")
        .insert(restaurant)
        .select()
        .single();

      if (error) throw error;

      fetchRestaurants();
      return data;
    } catch (error) {
      logger.error('createRestaurant', 'Error creating restaurant', { error });
      throw error;
    }
  };

  const updateRestaurant = async (id: string, updates: RestaurantUpdate) => {
    try {
      const { data, error } = await supabase
        .from("restaurants")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      fetchRestaurants();
      return data;
    } catch (error) {
      logger.error('updateRestaurant', 'Error updating restaurant', { error });
      throw error;
    }
  };

  const deleteRestaurant = async (id: string) => {
    try {
      const { error } = await supabase
        .from("restaurants")
        .delete()
        .eq("id", id);

      if (error) throw error;

      fetchRestaurants();
    } catch (error) {
      logger.error('deleteRestaurant', 'Error deleting restaurant', { error });
      throw error;
    }
  };

  // The shape callers already read, rebuilt from the query. Preserved exactly
  // so this lands without touching a single page.
  return {
    restaurants: data?.restaurants ?? [],
    totalCount: data?.totalCount ?? 0,
    suggestions: data?.suggestions ?? [],
    isLoading,
    /** True while any request for this list is in flight, including a page change behind kept rows. */
    isFetching,
    /** True while the rows shown are the previous page's, kept during a page change. */
    isPlaceholderData,
    error: errorMessage(error),
    refetch: fetchRestaurants,
    createRestaurant,
    updateRestaurant,
    deleteRestaurant,
  };
}

// ── The mobile list (eat-drink pass 2 WP1 item 7) ───────────────────────────

/** Rows per Load More. */
export const RESTAURANT_PAGE_SIZE = 30;

/** A cold `?page=N` restore loads at most this many pages up front. */
export const MAX_RESTORED_PAGES = 2;

/** One request's window: offset and how many rows it asks for. */
export interface RestaurantPageParam {
  offset: number;
  limit: number;
}

type RestaurantPage = RestaurantListResult & RestaurantPageParam;

/**
 * Where a list opened at `?page=N` starts. Mobile's `?page=N` means "N pages
 * were loaded", and replaying all N on a cold open is what moved about 4,000
 * rows to reach row 478. So the restore asks for the last two pages in one
 * request and offers "Load earlier results" for the rest.
 */
export function initialRestaurantPageParam(page: number, pageSize = RESTAURANT_PAGE_SIZE): RestaurantPageParam {
  const n = Math.max(1, Math.floor(page) || 1);
  const pages = Math.min(n, MAX_RESTORED_PAGES);
  return { offset: (n - pages) * pageSize, limit: pages * pageSize };
}

/** The next window after `last`, or undefined at the end of the list. */
export function nextRestaurantPageParam(
  last: RestaurantPage,
  pageSize = RESTAURANT_PAGE_SIZE
): RestaurantPageParam | undefined {
  const nextOffset = last.offset + last.limit;
  // A short page is the end even when the estimated count says otherwise.
  if (last.restaurants.length < last.limit) return undefined;
  if (nextOffset >= last.totalCount) return undefined;
  return { offset: nextOffset, limit: pageSize };
}

/** The window before `first`, or undefined when it already starts at row 1. */
export function previousRestaurantPageParam(
  first: RestaurantPageParam,
  pageSize = RESTAURANT_PAGE_SIZE
): RestaurantPageParam | undefined {
  if (first.offset <= 0) return undefined;
  const offset = Math.max(0, first.offset - pageSize);
  return { offset, limit: first.offset - offset };
}

/**
 * The phone's Load More list as offset pages of thirty (eat-drink pass 2 WP1
 * item 7). It used to ask for `limit=page*30, offset=0`, so every Load More
 * downloaded everything already on screen again.
 *
 * Keyed on the filters and the rotation seed, never on the page: Load More
 * writes `?page=` and must not start a new query. `startPage` is read only
 * when a key is first seen (a cold open, or a filter change, which resets the
 * page to 1).
 */
export function useInfiniteRestaurants(
  filters: RestaurantFilters,
  options: UseRestaurantsOptions & { startPage?: number } = {}
) {
  const seed = getRestaurantRotationSeed();
  const listFilters = { ...filters };
  delete listFilters.limit;
  delete listFilters.offset;

  const query = useInfiniteQuery<
    RestaurantPage,
    Error,
    InfiniteData<RestaurantPage, RestaurantPageParam>,
    readonly unknown[],
    RestaurantPageParam
  >({
    queryKey: [...queryKeys.restaurants.lists(), "infinite", listFilters, seed],
    staleTime: STALE_TIME.CONTENT_LIST,
    gcTime: GC_TIME,
    enabled: options.enabled ?? true,
    initialPageParam: initialRestaurantPageParam(options.startPage ?? 1),
    queryFn: async ({ pageParam }) => {
      const result = await fetchRestaurantList(
        { ...listFilters, limit: pageParam.limit, offset: pageParam.offset },
        { seed }
      );
      return { ...result, ...pageParam };
    },
    getNextPageParam: (last) => nextRestaurantPageParam(last),
    getPreviousPageParam: (first) => previousRestaurantPageParam(first),
  });

  const pages = query.data?.pages ?? [];
  const restaurants = pages.flatMap((p) => p.restaurants);
  const first = pages[0];
  const last = pages[pages.length - 1];

  return {
    restaurants,
    totalCount: last?.totalCount ?? 0,
    suggestions: first?.suggestions ?? [],
    /** Row index (0-based) of the first loaded row. */
    firstOffset: first?.offset ?? 0,
    /** How many pages of RESTAURANT_PAGE_SIZE the loaded rows reach, for `?page=`. */
    // 0 for an empty last page (a ?page= past the end), so nothing rewrites the URL.
    pagesThrough:
      last && last.restaurants.length > 0
        ? Math.ceil((last.offset + last.restaurants.length) / RESTAURANT_PAGE_SIZE)
        : 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    hasNextPage: query.hasNextPage,
    hasPreviousPage: query.hasPreviousPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isFetchingPreviousPage: query.isFetchingPreviousPage,
    fetchNextPage: query.fetchNextPage,
    fetchPreviousPage: query.fetchPreviousPage,
    error: errorMessage(query.error),
    refetch: query.refetch,
  };
}


// ── Restaurant filter options (WEB-PERF-002) ────────────────────────────────
// Distinct cuisines (with counts) + locations come from a server-side RPC
// (get_restaurant_filter_options) instead of fetching whole columns to dedupe
// in JS. Cached client-side for an hour (REFERENCE). Falls back to the legacy
// client-side scan if the RPC isn't deployed yet.

/**
 * Dietary selections map to keywords searched across name, description and
 * cuisine. There is no dietary column, so this is a text fan-out - which is
 * also why a dietary filter forces the non-RPC query path.
 */
export const DIETARY_KEYWORDS: Record<string, string[]> = {
  vegan: ["vegan"],
  vegetarian: ["vegetarian", "veggie"],
  "gluten-free": ["gluten free", "gluten-free", "celiac"],
  keto: ["keto", "low carb"],
  halal: ["halal"],
};

/**
 * WEB-FEAT-032: the dietary filter was wired to a key nothing set.
 *
 * RestaurantInlineFilters writes its dietary choices into `filters.tags`,
 * because the URL parameter is `tags`. This hook only ever read
 * `filters.dietary`, which no caller populates. So selecting Vegan showed an
 * active filter, changed the URL, incremented the filter count - and returned
 * the identical unfiltered list, because the selection also failed to knock the
 * query off the rotation RPC path that cannot express it.
 *
 * Reading both keys fixes it without renaming a URL parameter that shared links
 * already carry. Values are restricted to the known dietary vocabulary so that
 * a non-dietary tag can never turn into a bogus ILIKE across three columns.
 */
export function resolveDietarySelections(filters: {
  dietary?: string[];
  tags?: string[];
}): string[] {
  const candidates = [...(filters.dietary ?? []), ...(filters.tags ?? [])];
  return [...new Set(candidates.filter((value) => value in DIETARY_KEYWORDS))];
}

const RESTAURANT_TAGS = [
  "Takeout",
  "Delivery",
  "Outdoor Seating",
  "Family Friendly",
  "Date Night",
  "Happy Hour",
];

interface FilterOptionsResult {
  cuisines: { cuisine: string; count: number }[];
  locations: string[];
}

async function fetchFilterOptionsRpc(): Promise<FilterOptionsResult | null> {
  // get_restaurant_filter_options is added in a new migration and isn't in the
  // generated Database types yet.
  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: string
    ) => Promise<{ data: FilterOptionsResult | null; error: { message: string } | null }>
  )("get_restaurant_filter_options");
  if (error || !data) return null;
  return data;
}

async function fetchFilterOptionsFallback(): Promise<FilterOptionsResult> {
  const { data: cuisineData } = await supabase
    .from("restaurants")
    .select("cuisine")
    .not("cuisine", "is", null);
  const { data: locationData } = await supabase
    .from("restaurants")
    .select("location")
    .not("location", "is", null);

  const counts: Record<string, number> = {};
  cuisineData?.forEach((r) => {
    if (r.cuisine) counts[r.cuisine] = (counts[r.cuisine] || 0) + 1;
  });
  const cuisines = Object.entries(counts)
    .map(([cuisine, count]) => ({ cuisine, count }))
    .sort((a, b) => b.count - a.count);
  const locations = (
    [...new Set(locationData?.map((r) => r.location).filter(Boolean))] as string[]
  ).sort();

  return { cuisines, locations };
}

async function getRestaurantFilterOptions(): Promise<FilterOptionsResult> {
  return (await fetchFilterOptionsRpc()) ?? (await fetchFilterOptionsFallback());
}

/**
 * Cached cuisine/location facets for consumers outside the hook layer
 * (SearchSection's subcategory list, WEB-PERF-002).
 *
 * This export was missing while SearchSection imported it, which crashed the
 * homepage into the route error boundary — a missing named export is an
 * `undefined` binding once bundled (React error #130). See WEB-QA-001/003.
 */
export async function fetchRestaurantFilterFacets(): Promise<FilterOptionsResult> {
  return getRestaurantFilterOptions();
}

/**
 * The one cached facet query. Every consumer (hub, presets, filter popover,
 * search suggestions) shares this key, so the RPC runs once per hour at most.
 */
export const restaurantFilterOptionsQuery = {
  queryKey: ["restaurant-filter-options"] as const,
  queryFn: getRestaurantFilterOptions,
  staleTime: STALE_TIME.REFERENCE,
};

// Hook to get cuisine counts for "Browse by Cuisine" section
export function useCuisineCounts() {
  const { data, isLoading } = useQuery(restaurantFilterOptionsQuery);
  return { cuisineCounts: data?.cuisines ?? [], isLoading };
}

// Utility hook to get available filter options
export function useRestaurantFilterOptions() {
  const { data, isLoading } = useQuery(restaurantFilterOptionsQuery);
  return {
    cuisines: (data?.cuisines ?? []).map((c) => c.cuisine),
    /** Cuisines with their row counts, most common first (plan WP2 item 5). */
    cuisineCounts: data?.cuisines ?? [],
    locations: data?.locations ?? [],
    tags: RESTAURANT_TAGS,
    isLoading,
  };
}
