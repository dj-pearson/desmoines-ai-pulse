import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Event, RestaurantOpening, Restaurant, Attraction, Playground } from "@/lib/types";
import { createLogger } from '@/lib/logger';

const log = createLogger('useSupabase');

// Events hooks
export function useFeaturedEvents() {
  const today = new Date().toISOString().split('T')[0];
  
  return useQuery<Event[]>({
    queryKey: ['events', 'featured', today],
    queryFn: async () => {
      log.debug('Fetching featured events', { action: 'fetchFeaturedEvents', metadata: { dateFilter: today } });
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('is_featured', true)
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(6);
      
      if (error) {
        log.error('Error fetching featured events', { action: 'fetchFeaturedEvents', metadata: { error } });
        throw error;
      }
      log.debug('Featured events fetched', { action: 'fetchFeaturedEvents', metadata: { count: data?.length } });
      return data?.map(transformEvent) || [];
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
      log.debug('Fetching events', { action: 'fetchEvents', metadata: { dateFilter } });
      query = query.gte('date', dateFilter);
      
      if (filters?.category) {
        query = query.ilike('category', `%${filters.category}%`);
      }
      if (filters?.location) {
        query = query.ilike('location', `%${filters.location}%`);
      }
      
      const { data, error } = await query.order('date', { ascending: true });
      
      if (error) {
        log.error('Error fetching events', { action: 'fetchEvents', metadata: { error } });
        throw error;
      }
      log.debug('Events fetched', { action: 'fetchEvents', metadata: { count: data?.length } });
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
        .select('*')
        .in('status', ['opening_soon', 'announced'])
        .order('opening_date', { ascending: true, nullsFirst: false });
      
      if (error) {
        log.error('Error fetching restaurant openings', { action: 'fetchRestaurantOpenings', metadata: { error } });
        throw error;
      }
      log.debug('Restaurant openings fetched', { action: 'fetchRestaurantOpenings', metadata: { count: data?.length } });
      return data?.map(transformRestaurant) || [];
    },
    staleTime: 120000, // 2 minutes
    gcTime: 600000, // 10 minutes
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
}

export function useFeaturedRestaurants() {
  return useQuery<Restaurant[]>({
    queryKey: ['restaurants', 'featured'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('is_featured', true)
        .order('rating', { ascending: false })
        .limit(6);
      
      if (error) {
        log.error('Error fetching featured restaurants', { action: 'fetchFeaturedRestaurants', metadata: { error } });
        throw error;
      }
      log.debug('Featured restaurants fetched', { action: 'fetchFeaturedRestaurants', metadata: { count: data?.length } });
      return data?.map(transformRestaurant) || [];
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
        .select('*')
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
      const { data, error } = await supabase.functions.invoke('scrape-events');
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