import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Event, Restaurant } from "@/lib/types";
import { EVENT_LIST_COLUMNS, RESTAURANT_LIST_COLUMNS } from "@/lib/listColumns";
import { createLogger } from "@/lib/logger";
import { queryKeys } from "@/lib/queryKeys";
import { JUST_OPENED_WINDOW_DAYS, orderOpeningsWatch } from "@/lib/restaurantOpenings";
import { addCentralDays, centralDateOf } from "@/lib/timezone";

const logger = createLogger("useSupabase");

/** Deterministic daily shuffle using a numeric seed (e.g. date as YYYYMMDD integer).
 *  Returns a new array — original is not mutated. */
function deterministicShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff; // LCG
    const j = Math.abs(s) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Featured and opening hooks for the homepage (WEB-PERF-032).
 *
 * FIVE OF THIS FILE'S SEVEN EXPORTS WERE IMPORTED BY NOTHING and have been
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
 * What remains: useFeaturedEvents (FeaturedEvents.tsx) and useRestaurantOpenings
 * (RestaurantOpenings.tsx, AllInclusiveDashboard.tsx).
 */

// Events hooks
export function useFeaturedEvents() {
  const today = new Date().toISOString().split('T')[0];
  
  return useQuery<Event[]>({
    // WEB-PERF-032: was the bare ['events', 'featured', today], which sits
    // UNDER the ['events'] prefix every write invalidated - so approving one
    // queued event refetched a rail whose contents could not have changed.
    // queryKeys.events.featured() is outside lists(); see invalidateEvents.
    queryKey: queryKeys.events.featured(today),
    queryFn: async () => {
      const MAX_DISPLAY = 6;

      // Pass 1: sponsored events take priority
      const { data: sponsoredData, error: sponsoredError } = await supabase
        .from('events')
        .select(EVENT_LIST_COLUMNS)
        .eq('is_sponsored', true)
        .gte('date', today)
        .order('date', { ascending: true });

      if (sponsoredError) {
        logger.error('useFeaturedEvents', 'Error fetching sponsored events', { error: sponsoredError });
        throw sponsoredError;
      }

      const sponsored = (sponsoredData || []).map(transformEvent);
      const remainingSlots = Math.max(0, MAX_DISPLAY - sponsored.length);

      if (remainingSlots === 0) return sponsored.slice(0, MAX_DISPLAY);

      // Pass 2: fill remaining slots with rotated organic featured items
      const { data: featuredData, error: featuredError } = await supabase
        .from('events')
        .select(EVENT_LIST_COLUMNS)
        .eq('is_featured', true)
        .eq('is_sponsored', false)
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(20); // fetch more than needed to enable rotation

      if (featuredError) {
        logger.error('useFeaturedEvents', 'Error fetching featured events', { error: featuredError });
        throw featuredError;
      }

      // Daily deterministic rotation so the selection changes each day
      const seed = parseInt(today.replace(/-/g, ''), 10);
      const rotated = deterministicShuffle(featuredData || [], seed)
        .slice(0, remainingSlots)
        .map(transformEvent);

      const chosen = [...sponsored, ...rotated];
      const fallbackSlots = MAX_DISPLAY - chosen.length;
      if (fallbackSlots <= 0) return chosen;

      // Pass 3 (WEB-BE-040): featured used to be a coin toss at ingest, so the
      // rail was never short of rows. Now that only admins and campaigns set
      // it, a quiet week can leave fewer than six. Fill the rest with a
      // deterministic ranking (most popular, then soonest) rather than an
      // empty rail, and never repeat a row already chosen above.
      const chosenIds = chosen.map((e) => e.id);
      let fallbackQuery = supabase
        .from('events')
        .select(EVENT_LIST_COLUMNS)
        .gte('date', today)
        .neq('is_merged', true)
        .neq('is_hidden', true)
        // WEB-BE-034: archived_at is the other unpublish switch.
        .is('archived_at', null)
        .order('popularity_score', { ascending: false, nullsFirst: false })
        .order('date', { ascending: true })
        .limit(fallbackSlots);
      if (chosenIds.length > 0) {
        fallbackQuery = fallbackQuery.not('id', 'in', `(${chosenIds.join(',')})`);
      }

      const { data: fallbackData, error: fallbackError } = await fallbackQuery;

      if (fallbackError) {
        // The rail already has what it has; a failed fallback is not worth an
        // error state on the homepage.
        logger.warn('useFeaturedEvents', 'Fallback ranking failed', { error: fallbackError });
        return chosen;
      }

      return [...chosen, ...(fallbackData || []).map(transformEvent)];
    },
    staleTime: 60000, // 1 minute
    gcTime: 300000, // 5 minutes
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
}

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
function transformEvent(event: Record<string, unknown>): Event {
  return {
    id: event.id as string,
    title: event.title as string,
    original_description: event.original_description as string,
    enhanced_description: event.enhanced_description as string,
    date: event.date as string,
    location: event.location as string,
    venue: event.venue as string,
    category: event.category as string,
    price: event.price as string,
    image_url: event.image_url as string,
    source_url: event.source_url as string,
    is_enhanced: event.is_enhanced as boolean,
    is_featured: event.is_featured as boolean,
    is_sponsored: event.is_sponsored as boolean,
    sponsored_until: event.sponsored_until as string | null,
    created_at: event.created_at as string,
    updated_at: event.updated_at as string,
  };
}

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
