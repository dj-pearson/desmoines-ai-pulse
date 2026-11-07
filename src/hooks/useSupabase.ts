import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Restaurant } from "@/lib/types";
import { RESTAURANT_LIST_COLUMNS } from "@/lib/listColumns";
import { createLogger } from "@/lib/logger";
import { JUST_OPENED_WINDOW_DAYS, orderOpeningsWatch } from "@/lib/restaurantOpenings";
import { addCentralDays, centralDateOf } from "@/lib/timezone";

const logger = createLogger("useSupabase");

/**
 * Openings hook for the homepage (WEB-PERF-032).
 *
 * FIVE OF THIS FILE'S SEVEN EXPORTS WERE IMPORTED BY NOTHING and were
 * deleted: useEvents, useFeaturedRestaurants, useFeaturedAttractions,
 * useFeaturedPlaygrounds and useEventScraper. The story that found this named
 * only useEvents; a grep for each export in turn found the other four.
 *
 * The dead useEvents mattered more than the rest. It was a SECOND events
 * fetcher - `select('*')`, limit 100, keyed ['events', filters, today] - sharing
 * a name with the real one in @/hooks/useEvents, so an import from the wrong
 * module would have compiled, run, and quietly fetched every column of a
 * hundred rows including the tsvector and the PostGIS blob.
 *
 * useFeaturedEvents went the same way once FeaturedEvents.tsx, its only
 * caller, was found to be imported by nothing; it also bounded "upcoming" on
 * the UTC date. What remains: useRestaurantOpenings (RestaurantOpenings.tsx,
 * AllInclusiveDashboard.tsx).
 */

/**
 * A restaurant as the transform returns it, plus the stored `slug` and `city`.
 *
 * `slug` is selected by RESTAURANT_LIST_COLUMNS and was dropped here, so the
 * home dashboard rebuilt one from the name and linked "Proof's" to proof-s
 * where the row says proofs (home plan WP3 item 1). It is a new key, so the
 * callers that read `Restaurant` are unaffected. `city` is the same case: the
 * openings watch prints it next to the cuisine.
 */
export type RestaurantWithSlug = Restaurant & { slug?: string; city?: string };

interface RestaurantOpeningsOptions {
  /** Row cap. Omitted = every opening. */
  limit?: number;
  /**
   * Also return places marked newly_opened whose opening_date falls in the
   * last JUST_OPENED_WINDOW_DAYS. The hub's openings watch wants them; the
   * home dashboard prints "Opens <date>" for every row, so it leaves this off.
   */
  includeRecentlyOpened?: boolean;
}

export function useRestaurantOpenings(options: RestaurantOpeningsOptions = {}) {
  const { limit, includeRecentlyOpened = false } = options;
  // Central calendar dates, so the key changes once a day, not every render.
  const today = centralDateOf();
  const since = includeRecentlyOpened ? addCentralDays(today, -JUST_OPENED_WINDOW_DAYS) : null;
  return useQuery<RestaurantWithSlug[]>({
    // Every variant starts with 'restaurant-openings', so an invalidation of
    // that prefix still reaches all of them.
    queryKey:
      limit || since
        ? ['restaurant-openings', { limit: limit ?? null, since, today }]
        : ['restaurant-openings', { today }],
    queryFn: async () => {
      let query = supabase
        .from('restaurants')
        .select(RESTAURANT_LIST_COLUMNS)
        // Hide rows merged into a duplicate (WEB-AUTO-005).
        .neq('is_merged', true);
      // An upcoming row whose date has passed is a stale announcement
      // (eat-drink pass 2, WP2.7). It is left out here so it cannot take one
      // of the capped slots; /restaurants/new lists it under "Announced, not
      // confirmed". A stale year in an undated timeframe is dropped below.
      const upcoming = `and(status.in.(opening_soon,announced),or(opening_date.gte.${today},opening_date.is.null))`;
      query = since
        ? query.or(`${upcoming},and(status.eq.newly_opened,opening_date.gte.${since})`)
        : query.or(upcoming);
      // Ascending picks the right rows under the cap: every recent opening
      // (at most JUST_OPENED_WINDOW_DAYS old), then the soonest upcoming
      // dates, undated last. The display order is set after the fetch.
      query = query.order('opening_date', { ascending: true, nullsFirst: false });
      if (limit) {
        query = query.limit(limit);
      }
      const { data, error } = await query;

      if (error) {
        logger.error('useRestaurantOpenings', 'Error fetching restaurant openings', { error });
        throw error;
      }
      logger.info('useRestaurantOpenings', 'Restaurant openings fetched', { count: data?.length });
      // Newest opening first, then the soonest upcoming, then undated; stale
      // announcements dropped.
      return orderOpeningsWatch((data ?? []).map(transformRestaurant), (row) => ({
        id: row.id,
        name: row.name,
        status: row.status ?? null,
        opening_date: row.openingDate ?? null,
        opening_timeframe: row.openingTimeframe ?? null,
      }));
    },
    staleTime: 120000, // 2 minutes
    gcTime: 600000, // 10 minutes
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
}

// Transform functions to match frontend types
function transformRestaurant(restaurant: Record<string, unknown>): RestaurantWithSlug {
  return {
    id: restaurant.id as string,
    slug: (restaurant.slug as string | null) ?? undefined,
    city: (restaurant.city as string | null) ?? undefined,
    name: restaurant.name as string,
    cuisine: restaurant.cuisine as string,
    location: restaurant.location as string,
    rating: restaurant.rating as number,
    priceRange: restaurant.price_range as string,
    description: restaurant.description as string,
    phone: restaurant.phone as string,
    website: restaurant.website as string,
    image_url: restaurant.image_url as string,
    isFeatured: restaurant.is_featured as boolean,
    isSponsored: restaurant.is_sponsored as boolean,
    sponsoredUntil: restaurant.sponsored_until as string | null,
    openingDate: restaurant.opening_date as string | undefined,
    openingTimeframe: restaurant.opening_timeframe as string | undefined,
    status: restaurant.status as Restaurant["status"],
    sourceUrl: restaurant.source_url as string | undefined,
    createdAt: restaurant.created_at as string,
    updatedAt: restaurant.updated_at as string,
  };
}
