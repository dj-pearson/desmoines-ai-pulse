import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Event, RestaurantOpening, Restaurant, Attraction, Playground } from "@/lib/types";
import { EVENT_LIST_COLUMNS, RESTAURANT_LIST_COLUMNS, ATTRACTION_LIST_COLUMNS } from "@/lib/listColumns";
import { createLogger } from "@/lib/logger";

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

// Events hooks
export function useFeaturedEvents() {
  const today = new Date().toISOString().split('T')[0];
  
  return useQuery<Event[]>({
    queryKey: ['events', 'featured', today],
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

      return [...sponsored, ...rotated];
    },
    staleTime: 60000, // 1 minute
    gcTime: 300000, // 5 minutes
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
}

export function useEvents(filters?: { category?: string; location?: string; date?: string }) {
  const today = new Date().toISOString().split('T')[0];
  
  return useQuery<Event[]>({
    queryKey: ['events', filters, today],
    queryFn: async () => {
      let query = supabase.from('events').select('*');
      
      const dateFilter = filters?.date || today;
      logger.info('useEvents', 'Fetching events', { from: dateFilter });
      query = query.gte('date', dateFilter);
      
      if (filters?.category) {
        query = query.ilike('category', `%${filters.category}%`);
      }
      if (filters?.location) {
        query = query.ilike('location', `%${filters.location}%`);
      }
      
      const { data, error } = await query.order('date', { ascending: true }).limit(100);

      if (error) {
        logger.error('useEvents', 'Error fetching events', { error });
        throw error;
      }
      logger.info('useEvents', 'Events fetched', { count: data?.length });
      return data?.map(transformEvent) || [];
    },
    staleTime: 60000,
    gcTime: 300000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
}

export function useRestaurantOpenings() {
  return useQuery<Restaurant[]>({
    queryKey: ['restaurant-openings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restaurants')
        .select(RESTAURANT_LIST_COLUMNS)
        .in('status', ['opening_soon', 'announced'])
        .order('opening_date', { ascending: true, nullsFirst: false });
      
      if (error) {
        logger.error('useRestaurantOpenings', 'Error fetching restaurant openings', { error });
        throw error;
      }
      logger.info('useRestaurantOpenings', 'Restaurant openings fetched', { count: data?.length });
      return data?.map(transformRestaurant) || [];
    },
    staleTime: 120000, // 2 minutes
    gcTime: 600000, // 10 minutes
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
}

export function useFeaturedRestaurants() {
  const today = new Date().toISOString().split('T')[0];

  return useQuery<Restaurant[]>({
    queryKey: ['restaurants', 'featured', today],
    queryFn: async () => {
      const MAX_DISPLAY = 6;

      // Pass 1: sponsored restaurants take priority
      const { data: sponsoredData, error: sponsoredError } = await supabase
        .from('restaurants')
        .select(RESTAURANT_LIST_COLUMNS)
        .eq('is_sponsored', true)
        .order('rating', { ascending: false });

      if (sponsoredError) {
        logger.error('useFeaturedRestaurants', 'Error fetching sponsored restaurants', { error: sponsoredError });
        throw sponsoredError;
      }

      const sponsored = (sponsoredData || []).map(transformRestaurant);
      const remainingSlots = Math.max(0, MAX_DISPLAY - sponsored.length);

      if (remainingSlots === 0) return sponsored.slice(0, MAX_DISPLAY);

      // Pass 2: organic featured + highly-rated (≥4.0) restaurants as rotation pool
      const { data: featuredData, error: featuredError } = await supabase
        .from('restaurants')
        .select(RESTAURANT_LIST_COLUMNS)
        .or('is_featured.eq.true,rating.gte.4.0')
        .eq('is_sponsored', false)
        .order('rating', { ascending: false })
        .limit(30); // fetch more than needed to enable rotation

      if (featuredError) {
        logger.error('useFeaturedRestaurants', 'Error fetching featured restaurants', { error: featuredError });
        throw featuredError;
      }

      // Deduplicate (in case a restaurant is both is_featured and high-rated)
      const seen = new Set<string>();
      const pool = (featuredData || []).filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });

      // Daily deterministic rotation
      const seed = parseInt(today.replace(/-/g, ''), 10);
      const rotated = deterministicShuffle(pool, seed)
        .slice(0, remainingSlots)
        .map(transformRestaurant);

      return [...sponsored, ...rotated];
    },
    staleTime: 120000,
    gcTime: 600000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
}

export function useFeaturedAttractions() {
  return useQuery<Attraction[]>({
    queryKey: ['attractions', 'featured'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attractions')
        .select(ATTRACTION_LIST_COLUMNS)
        .eq('is_featured', true)
        .order('rating', { ascending: false })
        .limit(6);
      
      if (error) throw error;
      return data?.map(transformAttraction) || [];
    },
  });
}

export function useFeaturedPlaygrounds() {
  return useQuery<Playground[]>({
    queryKey: ['playgrounds', 'featured'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('playgrounds')
        .select('*')
        .eq('is_featured', true)
        .order('rating', { ascending: false })
        .limit(6);
      
      if (error) throw error;
      return data?.map(transformPlayground) || [];
    },
  });
}

export function useEventScraper() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('ingest/scrape-events');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Invalidate and refetch events
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
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

function transformRestaurant(restaurant: Record<string, unknown>): Restaurant {
  return {
    id: restaurant.id as string,
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
    status: restaurant.status as string | undefined,
    sourceUrl: restaurant.source_url as string | undefined,
    createdAt: restaurant.created_at as string,
    updatedAt: restaurant.updated_at as string,
  };
}

function transformAttraction(attraction: Record<string, unknown>): Attraction {
  return {
    id: attraction.id as string,
    name: attraction.name as string,
    type: attraction.type as string,
    location: attraction.location as string,
    description: attraction.description as string,
    rating: attraction.rating as number,
    website: attraction.website as string,
    image_url: attraction.image_url as string,
    isFeatured: attraction.is_featured as boolean,
    createdAt: attraction.created_at as string,
    updatedAt: attraction.updated_at as string,
  };
}

function transformPlayground(playground: Record<string, unknown>): Playground {
  return {
    id: playground.id as string,
    name: playground.name as string,
    location: playground.location as string,
    description: playground.description as string,
    ageRange: playground.age_range as string,
    amenities: playground.amenities as string[],
    rating: playground.rating as number,
    image_url: playground.image_url as string,
    isFeatured: playground.is_featured as boolean,
    createdAt: playground.created_at as string,
    updatedAt: playground.updated_at as string,
  };
}