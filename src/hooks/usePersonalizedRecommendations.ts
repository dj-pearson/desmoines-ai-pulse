import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface RecommendationItem {
  id: string;
  contentType: 'event' | 'restaurant' | 'attraction' | 'playground';
  contentId: string;
  content: any; // The actual content object
  score: number;
  reason: string;
  confidence: number;
}

interface PersonalizationContext {
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: string;
  season: 'spring' | 'summer' | 'fall' | 'winter';
  deviceType: 'mobile' | 'tablet' | 'desktop';
  location?: string;
  userPreferences?: any;
}

export function usePersonalizedRecommendations() {
  const { user } = useAuth();
  const [recommendations, setRecommendations] = useState<{
    events: RecommendationItem[];
    restaurants: RecommendationItem[];
    attractions: RecommendationItem[];
    trending: RecommendationItem[];
  }>({
    events: [],
    restaurants: [],
    attractions: [],
    trending: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [sessionId] = useState(() => crypto.randomUUID());

  // Get current context for personalization
  const getPersonalizationContext = useCallback((): PersonalizationContext => {
    const now = new Date();
    const hour = now.getHours();
    
    let timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night' = 'morning';
    if (hour >= 6 && hour < 12) timeOfDay = 'morning';
    else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
    else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
    else timeOfDay = 'night';

    const month = now.getMonth();
    let season: 'spring' | 'summer' | 'fall' | 'winter' = 'spring';
    if (month >= 2 && month <= 4) season = 'spring';
    else if (month >= 5 && month <= 7) season = 'summer';
    else if (month >= 8 && month <= 10) season = 'fall';
    else season = 'winter';

    const deviceType = getMobileDetect();
    
    return {
      timeOfDay,
      dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase(),
      season,
      deviceType: deviceType as 'mobile' | 'tablet' | 'desktop'
    };
  }, []);

  // Get user preferences from search analytics (existing table)
  const getUserPreferences = useCallback(async () => {
    try {
      // Use existing search_analytics table to derive preferences
      const { data: searches } = await supabase
        .from('search_analytics')
        .select('query, category, location, price_filter')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!searches || searches.length === 0) return null;

      // Derive preferences from search history
      const categories = searches.map(s => s.category).filter(Boolean);
      const locations = searches.map(s => s.location).filter(Boolean);
      const priceFilters = searches.map(s => s.price_filter).filter(Boolean);

      const preferredCategories = getTopItems(categories, 3);
      const preferredLocations = getTopItems(locations, 3);
      const preferredPrices = getTopItems(priceFilters, 2);

      return {
        preferred_categories: preferredCategories,
        preferred_locations: preferredLocations,
        preferred_price_ranges: preferredPrices
      };
    } catch (error) {
      console.log('No preferences found, using defaults');
      return null;
    }
  }, [user?.id]);

  // Helper function to get most frequent items
  const getTopItems = (items: string[], limit: number) => {
    const counts = items.reduce((acc, item) => {
      acc[item] = (acc[item] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(counts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .map(([item]) => item);
  };

  // Generate personalized event recommendations
  const getPersonalizedEvents = useCallback(async (context: PersonalizationContext, userPrefs: any) => {
    try {
      let query = supabase
        .from('events')
        .select('*')
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true })
        .limit(10);

      // Apply time-based filtering
      if (context.timeOfDay === 'evening' || context.dayOfWeek.includes('saturday') || context.dayOfWeek.includes('sunday')) {
        // Evening and weekend events
        query = query.or('category.ilike.%concert%,category.ilike.%festival%,category.ilike.%nightlife%');
      } else {
        // Daytime events
        query = query.or('category.ilike.%family%,category.ilike.%outdoor%,category.ilike.%cultural%');
      }

      const { data: events, error } = await query;
      if (error) throw error;

      // Score events based on user preferences and context
      const scoredEvents = (events || []).map(event => {
        let score = 50; // Base score
        let reasons = [];

        // Time-based scoring
        if (context.timeOfDay === 'evening' && event.category?.toLowerCase().includes('concert')) {
          score += 20;
          reasons.push('Popular evening activity');
        }

        // Preference-based scoring
        if (userPrefs?.preferred_categories) {
          if (userPrefs.preferred_categories.some((cat: string) => event.category?.toLowerCase().includes(cat.toLowerCase()))) {
            score += 30;
            reasons.push('Matches your interests');
          }
        }

        // Location preference
        if (userPrefs?.preferred_locations) {
          if (userPrefs.preferred_locations.some((loc: string) => event.location?.toLowerCase().includes(loc.toLowerCase()))) {
            score += 15;
            reasons.push('In your preferred area');
          }
        }

        // Trending bonus
        if (event.is_featured) {
          score += 10;
          reasons.push('Trending now');
        }

        return {
          id: `event-${event.id}`,
          contentType: 'event' as const,
          contentId: event.id,
          content: event,
          score,
          reason: reasons.length > 0 ? reasons.join(', ') : 'Recommended for you',
          confidence: Math.min(score / 100, 1)
        };
      });

      return scoredEvents.sort((a, b) => b.score - a.score).slice(0, 6);
    } catch (error) {
      console.error('Error generating event recommendations:', error);
      return [];
    }
  }, []);

  // Generate personalized restaurant recommendations
  const getPersonalizedRestaurants = useCallback(async (context: PersonalizationContext, userPrefs: any) => {
    try {
      let query = supabase
        .from('restaurants')
        .select('*')
        .order('popularity_score', { ascending: false })
        .limit(15);

      const { data: restaurants, error } = await query;
      if (error) throw error;

      // Score restaurants based on user preferences and context
      const scoredRestaurants = (restaurants || []).map(restaurant => {
        let score = 40; // Base score
        let reasons = [];

        // Time-based scoring
        if (context.timeOfDay === 'morning' && restaurant.cuisine?.toLowerCase().includes('coffee')) {
          score += 25;
          reasons.push('Perfect for morning');
        } else if (context.timeOfDay === 'evening' && restaurant.price_range === '$$$$') {
          score += 15;
          reasons.push('Great for dinner');
        }

        // Cuisine preference scoring (using search history)
        if (userPrefs?.preferred_categories) {
          if (userPrefs.preferred_categories.some((cat: string) => restaurant.cuisine?.toLowerCase().includes(cat.toLowerCase()))) {
            score += 35;
            reasons.push('Your favorite cuisine');
          }
        }

        // Price preference
        if (userPrefs?.preferred_price_ranges) {
          if (userPrefs.preferred_price_ranges.includes(restaurant.price_range)) {
            score += 20;
            reasons.push('In your price range');
          }
        }

        // Location preference (using the new city column)
        if (userPrefs?.preferred_locations && restaurant.location) {
          if (userPrefs.preferred_locations.some((loc: string) => restaurant.location?.toLowerCase().includes(loc.toLowerCase()))) {
            score += 15;
            reasons.push('In your area');
          }
        }

        // Rating bonus
        if (restaurant.rating && restaurant.rating >= 4.5) {
          score += 10;
          reasons.push('Highly rated');
        }

        // Featured bonus
        if (restaurant.is_featured) {
          score += 8;
          reasons.push('Featured restaurant');
        }

        return {
          id: `restaurant-${restaurant.id}`,
          contentType: 'restaurant' as const,
          contentId: restaurant.id,
          content: restaurant,
          score,
          reason: reasons.length > 0 ? reasons.join(', ') : 'Recommended for you',
          confidence: Math.min(score / 100, 1)
        };
      });

      return scoredRestaurants.sort((a, b) => b.score - a.score).slice(0, 6);
    } catch (error) {
      console.error('Error generating restaurant recommendations:', error);
      return [];
    }
  }, []);

  // Generate trending recommendations based on existing trending system
  const getTrendingRecommendations = useCallback(async () => {
    try {
      // Use existing trending_scores table
      const { data: trendingData, error } = await supabase
        .from('trending_scores')
        .select('*')
        .eq('date', new Date().toISOString().split('T')[0])
        .order('score', { ascending: false })
        .limit(12);

      if (error) throw error;

      const trendingItems = [];

      // Fetch content for each trending item
      for (const trending of trendingData || []) {
        try {
          const { data: content } = await supabase
            .from(trending.content_type === 'event' ? 'events' : 
                  trending.content_type === 'restaurant' ? 'restaurants' :
                  trending.content_type === 'attraction' ? 'attractions' : 'playgrounds')
            .select('*')
            .eq('id', trending.content_id)
            .single();

          if (content) {
            trendingItems.push({
              id: `trending-${trending.content_type}-${trending.content_id}`,
              contentType: trending.content_type,
              contentId: trending.content_id,
              content,
              score: trending.score,
              reason: `Trending with ${trending.views_7d} views this week`,
              confidence: Math.min(trending.score / 100, 1)
            });
          }
        } catch (contentError) {
          console.error('Error fetching trending content:', contentError);
        }
      }

      return trendingItems.slice(0, 8);
    } catch (error) {
      console.error('Error generating trending recommendations:', error);
      
      // Fallback to featured content if trending fails
      const { data: featuredEvents } = await supabase
        .from('events')
        .select('*')
        .eq('is_featured', true)
        .limit(4);

      return (featuredEvents || []).map(event => ({
        id: `trending-event-${event.id}`,
        contentType: 'event' as const,
        contentId: event.id,
        content: event,
        score: 70,
        reason: 'Featured event',
        confidence: 0.7
      }));
    }
  }, []);

  // Generate all recommendations
  const generateRecommendations = useCallback(async () => {
    setIsLoading(true);
    
    try {
      const context = getPersonalizationContext();
      const userPrefs = await getUserPreferences();

      const [events, restaurants, trending] = await Promise.all([
        getPersonalizedEvents(context, userPrefs),
        getPersonalizedRestaurants(context, userPrefs),
        getTrendingRecommendations()
      ]);

      // Simple attraction recommendations
      const { data: attractions } = await supabase
        .from('attractions')
        .select('*')
        .eq('is_featured', true)
        .limit(4);

      const attractionRecommendations = (attractions || []).map(attraction => ({
        id: `attraction-${attraction.id}`,
        contentType: 'attraction' as const,
        contentId: attraction.id,
        content: attraction,
        score: 60,
        reason: 'Popular attraction',
        confidence: 0.6
      }));

      setRecommendations({
        events,
        restaurants,
        attractions: attractionRecommendations,
        trending
      });

      console.log('Personalized recommendations generated:', {
        events: events.length,
        restaurants: restaurants.length,
        attractions: attractionRecommendations.length,
        trending: trending.length,
        context,
        userPrefs
      });

    } catch (error) {
      console.error('Error generating recommendations:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, getPersonalizationContext, getUserPreferences, getPersonalizedEvents, getPersonalizedRestaurants, getTrendingRecommendations]);

  // Track recommendation interaction (simplified version)
  const trackRecommendationInteraction = useCallback(async (recommendationId: string, action: 'view' | 'click' | 'like' | 'dislike') => {
    try {
      // Track in existing analytics table
      await supabase.from('user_analytics').insert({
        session_id: sessionId,
        user_id: user?.id,
        event_type: action,
        content_type: 'recommendation',
        content_id: recommendationId,
        device_type: getMobileDetect(),
        user_agent: navigator.userAgent,
        page_url: window.location.href
      });

      console.log('Recommendation interaction tracked:', { recommendationId, action });
    } catch (error) {
      console.error('Error tracking recommendation interaction:', error);
    }
  }, [sessionId, user?.id]);

  useEffect(() => {
    generateRecommendations();
  }, [generateRecommendations]);

  return {
    recommendations,
    isLoading,
    generateRecommendations,
    trackRecommendationInteraction,
    getPersonalizationContext
  };
}

// Helper function for device detection
function getMobileDetect(): string {
  const userAgent = navigator.userAgent;
  if (/tablet|ipad|playbook|silk/i.test(userAgent)) {
    return 'tablet';
  }
  if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(userAgent)) {
    return 'mobile';
  }
  return 'desktop';
}
