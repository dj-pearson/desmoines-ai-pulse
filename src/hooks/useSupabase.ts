import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Event, RestaurantOpening, Restaurant, Attraction, Playground } from "@/lib/types";

// Events hooks
export function useFeaturedEvents() {
  const today = new Date().toISOString().split('T')[0];
  
  return useQuery<Event[]>({
    queryKey: ['events', 'featured', today], // Include today's date to force cache refresh
    queryFn: async () => {
      console.log('Fetching featured events for date >= ', today);
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('is_featured', true)
        .gte('date', today) // Only today and future events
        .order('date', { ascending: true })
        .limit(6);
      
      if (error) throw error;
      console.log('Featured events fetched:', data?.length, 'events');
      return data?.map(transformEvent) || [];
    },
  });
}

export function useEvents(filters?: { category?: string; location?: string; date?: string }) {
  const today = new Date().toISOString().split('T')[0];
  
  return useQuery<Event[]>({
    queryKey: ['events', filters, today], // Include today's date to force cache refresh
    queryFn: async () => {
      let query = supabase.from('events').select('*');
      
      // Always filter to only show today and future events
      const dateFilter = filters?.date || today;
      console.log('Fetching events for date >=', dateFilter);
      query = query.gte('date', dateFilter);
      
      if (filters?.category) {
        query = query.ilike('category', `%${filters.category}%`);
      }
      if (filters?.location) {
        query = query.ilike('location', `%${filters.location}%`);
      }
      
      const { data, error } = await query.order('date', { ascending: true });
      
      if (error) throw error;
      console.log('Events fetched:', data?.length, 'events');
      return data?.map(transformEvent) || [];
    },
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
      
      if (error) throw error;
      return data?.map(transformRestaurant) || [];
    },
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
      
      if (error) throw error;
      return data?.map(transformRestaurant) || [];
    },
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
function transformEvent(event: any): Event {
  return {
    id: event.id,
    title: event.title,
    original_description: event.original_description,
    enhanced_description: event.enhanced_description,
    date: event.date,
    location: event.location,
    venue: event.venue,
    category: event.category,
    price: event.price,
    image_url: event.image_url,
    source_url: event.source_url,
    is_enhanced: event.is_enhanced,
    is_featured: event.is_featured,
    created_at: event.created_at,
    updated_at: event.updated_at,
  };
}

function transformRestaurantOpening(opening: any): RestaurantOpening {
  return {
    id: opening.id,
    name: opening.name,
    description: opening.description,
    location: opening.location,
    cuisine: opening.cuisine,
    openingDate: opening.opening_date,
    openingTimeframe: opening.opening_timeframe,
    status: opening.status,
    sourceUrl: opening.source_url,
    createdAt: opening.created_at,
    updatedAt: opening.updated_at,
  };
}

function transformRestaurant(restaurant: any): Restaurant {
  return {
    id: restaurant.id,
    name: restaurant.name,
    cuisine: restaurant.cuisine,
    location: restaurant.location,
    rating: restaurant.rating,
    priceRange: restaurant.price_range,
    description: restaurant.description,
    phone: restaurant.phone,
    website: restaurant.website,
    image_url: restaurant.image_url,
    isFeatured: restaurant.is_featured,
    openingDate: restaurant.opening_date,
    openingTimeframe: restaurant.opening_timeframe,
    status: restaurant.status,
    sourceUrl: restaurant.source_url,
    createdAt: restaurant.created_at,
    updatedAt: restaurant.updated_at,
  };
}

function transformAttraction(attraction: any): Attraction {
  return {
    id: attraction.id,
    name: attraction.name,
    type: attraction.type,
    location: attraction.location,
    description: attraction.description,
    rating: attraction.rating,
    website: attraction.website,
    image_url: attraction.image_url,
    isFeatured: attraction.is_featured,
    createdAt: attraction.created_at,
    updatedAt: attraction.updated_at,
  };
}

function transformPlayground(playground: any): Playground {
  return {
    id: playground.id,
    name: playground.name,
    location: playground.location,
    description: playground.description,
    ageRange: playground.age_range,
    amenities: playground.amenities,
    rating: playground.rating,
    image_url: playground.image_url,
    isFeatured: playground.is_featured,
    createdAt: playground.created_at,
    updatedAt: playground.updated_at,
  };
}