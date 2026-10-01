import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DES_MOINES_METRO_BOUNDS } from "@/lib/geo";
import { NOT_CLOSED_RESTAURANT_FILTER } from "@/lib/restaurantHours";
import { rankTopRated, TOP_RATED_LIMIT, type RankedRestaurantRow } from "@/lib/restaurantRanking";

/**
 * Columns the ranked list and its ItemList read. No description: the list
 * shows one factual line built from the other columns, and the description is
 * the longest field on the row.
 */
const TOP_RATED_COLUMNS =
  "id, name, slug, cuisine, city, location, neighborhood, price_range, rating, status, business_status, " +
  "google_place_id, is_merged, latitude, longitude, image_url, phone, website";

/**
 * How many rows to fetch, highest rating first, before rankTopRated applies
 * the rest of the rule. The rule's order is the query's order, so any prefix
 * that still holds 20 eligible rows with the whole tie group at the cut gives
 * the same answer as ranking every row. On 2026-10-01 the 20th place was row
 * 24 of this query, the 4.8 tie group ended at row 52, and row 150 was a 4.6.
 */
const TOP_RATED_FETCH = 150;

export type TopRatedRestaurant = RankedRestaurantRow & {
  image_url: string | null;
  phone: string | null;
  website: string | null;
};

/**
 * The 20 restaurants the /restaurants hub ranks (SEO-038). The database
 * narrows by the cheap conditions (not merged, not closed, rated, inside the
 * metro box); rankTopRated re-checks all of them and applies the rest, so the
 * page and the tests run one rule.
 */
export function useTopRatedRestaurants(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: ["restaurants", "top-rated", TOP_RATED_LIMIT],
    enabled,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<TopRatedRestaurant[]> => {
      const { data, error } = await supabase
        .from("restaurants")
        .select(TOP_RATED_COLUMNS)
        .neq("is_merged", true)
        .or(NOT_CLOSED_RESTAURANT_FILTER)
        .not("rating", "is", null)
        .gte("latitude", DES_MOINES_METRO_BOUNDS.minLatitude)
        .lte("latitude", DES_MOINES_METRO_BOUNDS.maxLatitude)
        .gte("longitude", DES_MOINES_METRO_BOUNDS.minLongitude)
        .lte("longitude", DES_MOINES_METRO_BOUNDS.maxLongitude)
        .order("rating", { ascending: false })
        .order("name", { ascending: true })
        .limit(TOP_RATED_FETCH);
      if (error) throw error;
      return rankTopRated((data ?? []) as unknown as TopRatedRestaurant[]);
    },
  });
}
