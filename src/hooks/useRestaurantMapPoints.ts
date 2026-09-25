import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DIETARY_KEYWORDS, resolveDietarySelections } from "@/hooks/useRestaurants";
import { formatOpenStatusLine, getRestaurantOpenStatus } from "@/lib/restaurantHours";
import { STALE_TIME, GC_TIME } from "@/lib/queryConfig";
import { queryKeys } from "@/lib/queryKeys";
import { hubSearchQuery } from "@/components/events/eventsHubQuery";

/**
 * Closed rows stay off the map (eat-drink pass 2 WP1 item 11): a red pin for
 * a place that shut for good is a pin nobody can use. Written as an OR so a
 * NULL status (the column's default was 'open', but older rows can be NULL)
 * is kept; a plain neq would drop it.
 */
const NOT_CLOSED = "status.is.null,status.neq.closed";

/**
 * Every restaurant the map can draw for the visitor's filters (eat-drink plan
 * WP4 item 1).
 *
 * The map used to get the list's 30-row page, so it showed 30 pins out of ~480
 * and called that the map. This runs the legacy table query once with the same
 * filters and a narrow projection, bounded at MAP_POINT_LIMIT, and only mounts
 * in map view (RestaurantsMap is the only caller, and it lives in the lazy map
 * chunk), so list view makes no map request.
 *
 * Rows without coordinates are fetched too, on purpose: the map says how many
 * it could not place and lists them by name (item 3) instead of dropping them.
 *
 * Every column below is already in RESTAURANT_LIST_COLUMNS, which the list
 * selects today, so this adds no schema dependency. hours_json is deliberately
 * absent until check-schema:probe shows it (plan D6).
 */
export const MAP_POINT_COLUMNS =
  "id, name, slug, latitude, longitude, cuisine, opening, price_range, rating, image_url, phone, status";

/** Enough for the whole metro today (~480 rows) with headroom. */
export const MAP_POINT_LIMIT = 1000;

export interface RestaurantMapPoint {
  id: string;
  name: string;
  slug: string | null;
  latitude: number | null;
  longitude: number | null;
  cuisine: string | null;
  opening: string | null;
  price_range: string | null;
  rating: number | null;
  image_url: string | null;
  phone: string | null;
  status: string | null;
}

/** The subset of the hub's filters the map honours. Sort is irrelevant to pins. */
export interface RestaurantMapFilters {
  search?: string;
  cuisine?: string[];
  priceRange?: string[];
  rating?: number[];
  location?: string[];
  featuredOnly?: boolean;
  tags?: string[];
  dietary?: string[];
}

/** Only the filter fields that change the result set, so a sort change reuses the cache. */
export function mapFilterKey(filters: RestaurantMapFilters): Record<string, unknown> {
  const sorted = (list?: string[]) => [...(list ?? [])].sort();
  return {
    scope: "map",
    search: filters.search?.trim() || "",
    cuisine: sorted(filters.cuisine),
    priceRange: sorted(filters.priceRange),
    rating: hasRatingFilter(filters.rating) ? filters.rating : null,
    location: sorted(filters.location),
    featuredOnly: !!filters.featuredOnly,
    dietary: resolveDietarySelections(filters).sort(),
  };
}

/** Same rule as useRestaurants: the full 0-5 range is "no filter" (WEB-QA-011). */
function hasRatingFilter(rating: number[] | undefined): rating is [number, number] {
  if (!rating || rating.length !== 2) return false;
  return rating[0] > 0 || rating[1] < 5;
}

export function hasCoordinates(
  point: Pick<RestaurantMapPoint, "latitude" | "longitude">
): point is RestaurantMapPoint & { latitude: number; longitude: number } {
  return (
    typeof point.latitude === "number" &&
    typeof point.longitude === "number" &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude)
  );
}

export interface SplitMapPoints {
  mapped: Array<RestaurantMapPoint & { latitude: number; longitude: number }>;
  unmapped: RestaurantMapPoint[];
}

export function splitByCoordinates(points: RestaurantMapPoint[]): SplitMapPoints {
  const mapped: SplitMapPoints["mapped"] = [];
  const unmapped: RestaurantMapPoint[] = [];
  for (const point of points) {
    if (hasCoordinates(point)) mapped.push(point);
    else unmapped.push(point);
  }
  return { mapped, unmapped };
}

/** The four pin groups. Colour is never the only carrier: every one has a text label. */
export type MapPinStatus = "open" | "closing-soon" | "closed" | "unknown";

export const MAP_PIN_STATUS_ORDER: MapPinStatus[] = ["open", "closing-soon", "closed", "unknown"];

export const MAP_PIN_STATUS_LEGEND: Record<MapPinStatus, string> = {
  open: "Open now",
  "closing-soon": "Closing soon",
  closed: "Closed",
  unknown: "Hours unknown",
};

/**
 * Pin colours. Four hues that stay apart for the common colour-vision
 * deficiencies (green/amber differ in lightness as well as hue), each drawn
 * with a white ring so it reads on any tile.
 */
export const MAP_PIN_STATUS_COLORS: Record<MapPinStatus, string> = {
  open: "#15803d",
  "closing-soon": "#b45309",
  closed: "#b91c1c",
  unknown: "#64748b",
};

export interface MapPinState {
  status: MapPinStatus;
  /** One line of text for the popup, marker title and list: "Open until 10 PM". */
  label: string;
}

/**
 * Status for one pin at `now`, read through the shared Central-time evaluator.
 *
 * The listing's own `status` column wins over the hours text: a closed or
 * not-yet-open place is never shown as open because its old hours parse.
 */
export function mapPinState(
  point: Pick<RestaurantMapPoint, "opening" | "status">,
  now: Date
): MapPinState {
  if (point.status === "closed") return { status: "closed", label: "Permanently closed" };
  // "announced" is not open yet either. Its hours text, when it has any, is
  // the hours it will keep, so it must not colour the pin green today.
  if (point.status === "opening_soon" || point.status === "announced") {
    return { status: "closed", label: "Not open yet" };
  }
  const result = getRestaurantOpenStatus(point.opening, now);
  const line = formatOpenStatusLine(result);
  switch (result.status) {
    case "open":
    case "closing-soon":
    case "closed":
      return { status: result.status, label: line ?? MAP_PIN_STATUS_LEGEND[result.status] };
    default:
      return { status: "unknown", label: MAP_PIN_STATUS_LEGEND.unknown };
  }
}

export interface RestaurantMapPointsResult {
  points: RestaurantMapPoint[];
  /** Rows matching the filters, mapped or not. */
  totalCount: number;
}

async function fetchRestaurantMapPoints(filters: RestaurantMapFilters): Promise<RestaurantMapPointsResult> {
  let query = supabase
    .from("restaurants")
    .select(MAP_POINT_COLUMNS, { count: "estimated" })
    .neq("is_merged", true);

  // The list's prefix search (pass 2 WP1 item 6), so "harb" puts the same
  // restaurant on the map as in the list.
  const search = hubSearchQuery(filters.search ?? "");
  if (search) {
    query = query.textSearch("search_vector", search.query, {
      ...(search.type ? { type: search.type } : {}),
      config: "english",
    });
  }
  if (filters.cuisine && filters.cuisine.length > 0) query = query.in("cuisine", filters.cuisine);
  if (filters.priceRange && filters.priceRange.length > 0) query = query.in("price_range", filters.priceRange);
  if (hasRatingFilter(filters.rating)) {
    query = query.gte("rating", filters.rating[0]).lte("rating", filters.rating[1]);
  }
  if (filters.location && filters.location.length > 0) query = query.in("location", filters.location);
  if (filters.featuredOnly) query = query.eq("is_featured", true);

  // One or= param. With a dietary filter the two OR groups are AND-ed
  // inside it, rather than relying on how PostgREST combines repeated keys.
  const dietary = resolveDietarySelections(filters);
  if (dietary.length > 0) {
    const orClauses = dietary.flatMap((diet) =>
      (DIETARY_KEYWORDS[diet] || [diet]).flatMap((kw) => [
        `description.ilike.%${kw}%`,
        `cuisine.ilike.%${kw}%`,
        `name.ilike.%${kw}%`,
      ])
    );
    query = query.or(`and(or(${NOT_CLOSED}),or(${orClauses.join(",")}))`);
  } else {
    query = query.or(NOT_CLOSED);
  }

  const { data, error, count } = await query
    .order("name", { ascending: true })
    .limit(MAP_POINT_LIMIT)
    .returns<RestaurantMapPoint[]>();

  if (error) throw error;
  const points = (data ?? []).filter(
    (row): row is RestaurantMapPoint => !!row?.id && !!row?.name && row.status !== "closed"
  );
  // Under the limit the rows are the whole set, whatever the estimate says.
  const totalCount = points.length < MAP_POINT_LIMIT ? points.length : Math.max(count ?? 0, points.length);
  return { points, totalCount };
}

export function useRestaurantMapPoints(filters: RestaurantMapFilters, options: { enabled?: boolean } = {}) {
  const key = mapFilterKey(filters);
  const { data, isLoading, error } = useQuery<RestaurantMapPointsResult>({
    queryKey: queryKeys.restaurants.list(key),
    queryFn: () => fetchRestaurantMapPoints(filters),
    enabled: options.enabled ?? true,
    staleTime: STALE_TIME.CONTENT_LIST,
    gcTime: GC_TIME,
  });

  return {
    points: data?.points ?? [],
    totalCount: data?.totalCount ?? 0,
    isLoading,
    error: error ? (error instanceof Error ? error.message : "Failed to load the map") : null,
  };
}
