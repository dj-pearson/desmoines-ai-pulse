/**
 * Enhanced Event Recommendations Hook
 * Integrates the advanced recommendation algorithm with user preferences
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { Event } from '@/lib/types';
import {
  scoreAndRankEvents,
  getDefaultBehavioralSignals,
  ScoredRecommendation,
} from '@/lib/recommendationAlgorithm';
import { defaultPreferences } from '@/types/preferences';

interface UseEnhancedRecommendationsOptions {
  limit?: number;
  enabled?: boolean;
}

export function useEnhancedRecommendations(
  options: UseEnhancedRecommendationsOptions = {}
) {
  const { isAuthenticated, user } = useAuth();
  const { preferences, isLoading: preferencesLoading } = useUserPreferences();
  const { recentlyViewed } = useRecentlyViewed();
  const { limit = 10, enabled = true } = options;

  const recommendationsQuery = useQuery({
    queryKey: [
      'enhanced-recommendations',
      user?.id,
      preferences?.lastUpdated,
      recentlyViewed.length,
      limit,
    ],
    queryFn: async (): Promise<ScoredRecommendation<Event>[]> => {
      try {
        // Fetch upcoming events
        const { data: events, error } = await supabase
          .from('events')
          .select('*')
          .gte('date', new Date().toISOString().split('T')[0])
          .order('date', { ascending: true })
          .limit(100); // Fetch more to filter

        if (error) throw error;
        if (!events || events.length === 0) return [];

        // Use user preferences or defaults
        const userPrefs = preferences || {
          ...defaultPreferences,
          userId: user?.id || 'anonymous',
        };

        // Build behavioral signals from recently viewed
        const behavioral = {
          ...getDefaultBehavioralSignals(),
          recentlyViewed: recentlyViewed.map((item) => item.id),
        };

        // Score and rank events using the AI algorithm
        const scoredEvents = scoreAndRankEvents(
          events as Event[],
          userPrefs,
          behavioral,
          limit
        );

        // Add recommendation reasons to events
        return scoredEvents.map((scored) => ({
          ...scored,
          item: {
            ...scored.item,
            recommendation_score: scored.score,
            recommendation_reason: scored.reasons[0] || 'Recommended for you',
          },
        }));
      } catch (error) {
        console.error('Error generating enhanced recommendations:', error);
        return [];
      }
    },
    enabled: enabled && !preferencesLoading,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false,
  });

  return {
    recommendations: recommendationsQuery.data?.map((r) => r.item) || [],
    scoredRecommendations: recommendationsQuery.data || [],
    isLoading: recommendationsQuery.isLoading || preferencesLoading,
    isError: recommendationsQuery.isError,
    error: recommendationsQuery.error,
    refetch: recommendationsQuery.refetch,
    isPersonalized: isAuthenticated && preferences?.onboardingCompleted,
    hasPreferences: preferences?.onboardingCompleted || false,
  };
}

/**
 * Hook for restaurant recommendations
 */
export function useRestaurantRecommendations(
  options: UseEnhancedRecommendationsOptions = {}
) {
  const { isAuthenticated, user } = useAuth();
  const { preferences, isLoading: preferencesLoading } = useUserPreferences();
  const { limit = 10, enabled = true } = options;

  const recommendationsQuery = useQuery({
    queryKey: [
      'restaurant-recommendations',
      user?.id,
      preferences?.lastUpdated,
      limit,
    ],
    queryFn: async () => {
      try {
        const { data: restaurants, error } = await supabase
          .from('restaurants')
          .select('*')
          .order('rating', { ascending: false })
          .limit(50);

        if (error) throw error;
        if (!restaurants || restaurants.length === 0) return [];

        // Use user preferences or defaults
        const userPrefs = preferences || {
          ...defaultPreferences,
          userId: user?.id || 'anonymous',
        };

        // Score restaurants based on preferences
        const scoredRestaurants = restaurants.map((restaurant) => {
          let score = 40; // Base score
          const reasons: string[] = [];

          // Cuisine preference matching
          if (
            userPrefs.cuisine.favorites.length > 0 &&
            restaurant.cuisine
          ) {
            const cuisineMatch = userPrefs.cuisine.favorites.some((fav) =>
              restaurant.cuisine.toLowerCase().includes(fav.toLowerCase())
            );
            if (cuisineMatch) {
              score += 30;
              reasons.push('Matches your favorite cuisine');
            }
          }

          // Dietary restrictions
          if (userPrefs.cuisine.dietary.length > 0 && restaurant.dietary_options) {
            const dietaryMatch = userPrefs.cuisine.dietary.some((restriction) =>
              restaurant.dietary_options?.includes(restriction)
            );
            if (dietaryMatch) {
              score += 20;
              reasons.push('Accommodates your dietary needs');
            }
          }

          // Price range matching
          if (
            userPrefs.cuisine.priceRange !== 'any' &&
            restaurant.price_range === userPrefs.cuisine.priceRange
          ) {
            score += 15;
            reasons.push('In your preferred price range');
          }

          // Location preference
          if (
            userPrefs.location.neighborhoods.length > 0 &&
            restaurant.location
          ) {
            const locationMatch = userPrefs.location.neighborhoods.some(
              (neighborhood) =>
                restaurant.location
                  ?.toLowerCase()
                  .includes(neighborhood.toLowerCase())
            );
            if (locationMatch) {
              score += 25;
              reasons.push('In your preferred neighborhood');
            }
          }

          // Rating boost
          if (restaurant.rating && restaurant.rating >= 4.5) {
            score += 15;
            reasons.push('Highly rated');
          }

          // Featured boost
          if (restaurant.is_featured) {
            score += 10;
            reasons.push('Featured restaurant');
          }

          return {
            ...restaurant,
            recommendation_score: score,
            recommendation_reason: reasons[0] || 'Recommended for you',
            reasons,
          };
        });

        // Sort by score and return top results
        scoredRestaurants.sort(
          (a, b) => b.recommendation_score - a.recommendation_score
        );

        return scoredRestaurants.slice(0, limit);
      } catch (error) {
        console.error('Error generating restaurant recommendations:', error);
        return [];
      }
    },
    enabled: enabled && !preferencesLoading,
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
    refetchOnWindowFocus: false,
  });

  return {
    recommendations: recommendationsQuery.data || [],
    isLoading: recommendationsQuery.isLoading || preferencesLoading,
    isError: recommendationsQuery.isError,
    error: recommendationsQuery.error,
    refetch: recommendationsQuery.refetch,
    isPersonalized: isAuthenticated && preferences?.onboardingCompleted,
  };
}
