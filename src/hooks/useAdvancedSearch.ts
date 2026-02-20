import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { createLogger } from '@/lib/logger';

const log = createLogger('useAdvancedSearch');

export interface AdvancedSearchFilters {
  query: string;
  category: string;
  location: string;
  radius: number;
  priceRange: [number, number];
  rating: number;
  dateRange: {
    start?: Date;
    end?: Date;
  };
  timeOfDay: string[];
  features: string[];
  sortBy: string;
  openNow: boolean;
  featuredOnly: boolean;
  hasDeals: boolean;
  accessibility: string[];
  tags: string[];
}

export interface SavedSearch {
  id: string;
  name: string;
  filters: AdvancedSearchFilters;
  createdAt: Date;
  lastUsed?: Date;
  useCount: number;
}

export interface SearchResult {
  id: string;
  type: 'event' | 'restaurant' | 'attraction' | 'playground';
  title: string;
  description?: string;
  location: string;
  rating?: number;
  price?: string;
  imageUrl?: string;
  distance?: number;
  features?: string[];
  relevanceScore?: number;
}

const defaultFilters: AdvancedSearchFilters = {
  query: '',
  category: 'All',
  location: '',
  radius: 10,
  priceRange: [0, 200],
  rating: 0,
  dateRange: {},
  timeOfDay: [],
  features: [],
  sortBy: 'relevance',
  openNow: false,
  featuredOnly: false,
  hasDeals: false,
  accessibility: [],
  tags: []
};

export function useAdvancedSearch() {
  const { user } = useAuth();
  const [filters, setFilters] = useState<AdvancedSearchFilters>(defaultFilters);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);

  // Get user's location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          log.debug('init', 'Location access denied', { error });
        }
      );
    }
  }, []);

  // Load saved searches
  const loadSavedSearches = useCallback(async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('saved_searches')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      const formattedSearches: SavedSearch[] = data?.map(search => ({
        id: search.id,
        name: search.name,
        filters: search.filters as unknown as AdvancedSearchFilters,
        createdAt: new Date(search.created_at),
        lastUsed: search.last_used ? new Date(search.last_used) : undefined,
        useCount: search.use_count || 0
      })) || [];
      
      setSavedSearches(formattedSearches);
    } catch (error) {
      log.error('loadSavedSearches', 'Error loading saved searches', { error });
      setSavedSearches([]);
    }
  }, [user]);

  useEffect(() => {
    loadSavedSearches();
  }, [loadSavedSearches]);

  // Calculate distance between two points
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Enhanced search function
  const performSearch = useCallback(async (searchFilters: AdvancedSearchFilters) => {
    setLoading(true);
    try {
      const searchResults: SearchResult[] = [];

      // Search different content types based on category filter
      const categories = searchFilters.category === 'All' 
        ? ['Events', 'Restaurants', 'Attractions', 'Playgrounds']
        : [searchFilters.category];

      for (const category of categories) {
        switch (category) {
          case 'Events':
            const eventsResults = await searchEvents(searchFilters);
            searchResults.push(...eventsResults);
            break;
          case 'Restaurants':
            const restaurantsResults = await searchRestaurants(searchFilters);
            searchResults.push(...restaurantsResults);
            break;
          case 'Attractions':
            const attractionsResults = await searchAttractions(searchFilters);
            searchResults.push(...attractionsResults);
            break;
          case 'Playgrounds':
            const playgroundsResults = await searchPlaygrounds(searchFilters);
            searchResults.push(...playgroundsResults);
            break;
        }
      }

      // Apply location-based filtering
      const filteredResults = filterByLocation(searchResults, searchFilters);
      
      // Sort results
      const sortedResults = sortResults(filteredResults, searchFilters);

      setResults(sortedResults);
    } catch (error) {
      log.error('performSearch', 'Search error', { error });
      toast.error('Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [userLocation]);

  const searchEvents = async (searchFilters: AdvancedSearchFilters): Promise<SearchResult[]> => {
    let query = supabase
      .from('events')
      .select('*')
      .gte('date', new Date().toISOString());

    // Apply text search
    if (searchFilters.query) {
      query = query.or(`title.ilike.%${searchFilters.query}%,venue.ilike.%${searchFilters.query}%,location.ilike.%${searchFilters.query}%`);
    }

    // Apply location filter
    if (searchFilters.location && searchFilters.location !== 'Near Me') {
      query = query.ilike('location', `%${searchFilters.location}%`);
    }

    // Apply featured filter
    if (searchFilters.featuredOnly) {
      query = query.eq('is_featured', true);
    }

    // Apply date range filter
    if (searchFilters.dateRange.start) {
      query = query.gte('date', searchFilters.dateRange.start.toISOString());
    }
    if (searchFilters.dateRange.end) {
      query = query.lte('date', searchFilters.dateRange.end.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;

    return data?.map(event => ({
      id: event.id,
      type: 'event' as const,
      title: event.title,
      description: event.enhanced_description || event.original_description,
      location: event.location,
      price: event.price,
      imageUrl: event.image_url,
      features: []
    })) || [];
  };

  const searchRestaurants = async (searchFilters: AdvancedSearchFilters): Promise<SearchResult[]> => {
    let query = supabase
      .from('restaurants')
      .select('*');

    // Apply text search
    if (searchFilters.query) {
      query = query.or(`name.ilike.%${searchFilters.query}%,cuisine.ilike.%${searchFilters.query}%,location.ilike.%${searchFilters.query}%`);
    }

    // Apply location filter
    if (searchFilters.location && searchFilters.location !== 'Near Me') {
      query = query.ilike('location', `%${searchFilters.location}%`);
    }

    // Apply rating filter
    if (searchFilters.rating > 0) {
      query = query.gte('rating', searchFilters.rating);
    }

    // Apply featured filter
    if (searchFilters.featuredOnly) {
      query = query.eq('is_featured', true);
    }

    // Apply open now filter (simplified - would need actual hours data)
    if (searchFilters.openNow) {
      // This would need to be implemented with actual opening hours data
    }

    const { data, error } = await query;
    if (error) throw error;

    return data?.map(restaurant => ({
      id: restaurant.id,
      type: 'restaurant' as const,
      title: restaurant.name,
      description: restaurant.description,
      location: restaurant.location,
      rating: restaurant.rating,
      price: restaurant.price_range,
      imageUrl: restaurant.image_url,
      features: []
    })) || [];
  };

  const searchAttractions = async (searchFilters: AdvancedSearchFilters): Promise<SearchResult[]> => {
    let query = supabase
      .from('attractions')
      .select('*');

    // Apply text search
    if (searchFilters.query) {
      query = query.or(`name.ilike.%${searchFilters.query}%,type.ilike.%${searchFilters.query}%,location.ilike.%${searchFilters.query}%`);
    }

    // Apply location filter
    if (searchFilters.location && searchFilters.location !== 'Near Me') {
      query = query.ilike('location', `%${searchFilters.location}%`);
    }

    // Apply rating filter
    if (searchFilters.rating > 0) {
      query = query.gte('rating', searchFilters.rating);
    }

    // Apply featured filter
    if (searchFilters.featuredOnly) {
      query = query.eq('is_featured', true);
    }

    const { data, error } = await query;
    if (error) throw error;

    return data?.map(attraction => ({
      id: attraction.id,
      type: 'attraction' as const,
      title: attraction.name,
      description: attraction.description,
      location: attraction.location,
      rating: attraction.rating,
      imageUrl: attraction.image_url,
      features: []
    })) || [];
  };

  const searchPlaygrounds = async (searchFilters: AdvancedSearchFilters): Promise<SearchResult[]> => {
    let query = supabase
      .from('playgrounds')
      .select('*');

    // Apply text search
    if (searchFilters.query) {
      query = query.or(`name.ilike.%${searchFilters.query}%,location.ilike.%${searchFilters.query}%`);
    }

    // Apply location filter
    if (searchFilters.location && searchFilters.location !== 'Near Me') {
      query = query.ilike('location', `%${searchFilters.location}%`);
    }

    // Apply rating filter
    if (searchFilters.rating > 0) {
      query = query.gte('rating', searchFilters.rating);
    }

    // Apply featured filter
    if (searchFilters.featuredOnly) {
      query = query.eq('is_featured', true);
    }

    const { data, error } = await query;
    if (error) throw error;

    return data?.map(playground => ({
      id: playground.id,
      type: 'playground' as const,
      title: playground.name,
      description: playground.description,
      location: playground.location,
      rating: playground.rating,
      imageUrl: playground.image_url,
      features: []
    })) || [];
  };

  const filterByLocation = (results: SearchResult[], searchFilters: AdvancedSearchFilters): SearchResult[] => {
    if (searchFilters.location === 'Near Me' && userLocation) {
      return results.filter(result => {
        // This would need actual lat/lng data for each result
        // For now, return all results with distance calculation if available
        return true;
      }).map(result => ({
        ...result,
        distance: Math.random() * searchFilters.radius // Placeholder distance
      }));
    }
    return results;
  };

  const sortResults = (results: SearchResult[], searchFilters: AdvancedSearchFilters): SearchResult[] => {
    return [...results].sort((a, b) => {
      switch (searchFilters.sortBy) {
        case 'rating':
          return (b.rating || 0) - (a.rating || 0);
        case 'distance':
          return (a.distance || 0) - (b.distance || 0);
        case 'price_low':
          // Simplified price comparison
          return (a.price || '').localeCompare(b.price || '');
        case 'price_high':
          return (b.price || '').localeCompare(a.price || '');
        case 'relevance':
        default:
          return (b.relevanceScore || 0) - (a.relevanceScore || 0);
      }
    });
  };

  const saveSearch = async (name: string, searchFilters: AdvancedSearchFilters) => {
    if (!user) {
      toast.error('Please sign in to save searches');
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('saved_searches')
        .insert({
          user_id: user.id,
          name,
          filters: searchFilters as any,
          use_count: 1
        })
        .select()
        .single();
      
      if (error) throw error;
      
      const newSearch: SavedSearch = {
        id: data.id,
        name: data.name,
        filters: data.filters as unknown as AdvancedSearchFilters,
        createdAt: new Date(data.created_at),
        useCount: 1
      };
      
      setSavedSearches(prev => [newSearch, ...prev]);
      toast.success('Search saved successfully');
    } catch (error) {
      log.error('saveSearch', 'Error saving search', { error });
      toast.error('Failed to save search');
    }
  };

  const loadSearch = async (search: SavedSearch) => {
    try {
      // Update use count and last used
      await supabase
        .from('saved_searches')
        .update({
          use_count: search.useCount + 1,
          last_used: new Date().toISOString()
        })
        .eq('id', search.id);
      
      // Update local state
      setSavedSearches(prev => 
        prev.map(s => 
          s.id === search.id 
            ? { ...s, useCount: s.useCount + 1, lastUsed: new Date() }
            : s
        )
      );
      
      setFilters(search.filters);
      await performSearch(search.filters);
    } catch (error) {
      log.error('loadSearch', 'Error loading search', { error });
      setFilters(search.filters);
      await performSearch(search.filters);
    }
  };

  const deleteSearch = async (searchId: string) => {
    try {
      const { error } = await supabase
        .from('saved_searches')
        .delete()
        .eq('id', searchId);
      
      if (error) throw error;
      
      setSavedSearches(prev => prev.filter(s => s.id !== searchId));
      toast.success('Search deleted successfully');
    } catch (error) {
      log.error('deleteSearch', 'Error deleting search', { error });
      toast.error('Failed to delete search');
    }
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
    setResults([]);
  };

  return {
    filters,
    setFilters,
    results,
    savedSearches,
    loading,
    performSearch,
    saveSearch,
    loadSearch,
    deleteSearch,
    resetFilters,
    userLocation
  };
}