import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { EVENT_LIST_COLUMNS, RESTAURANT_LIST_COLUMNS, ATTRACTION_LIST_COLUMNS } from '@/lib/listColumns';

interface TrendingItem {
  id: string;
  contentType: 'event' | 'restaurant' | 'attraction' | 'playground';
  contentId: string;
  score: number;
  rank: number;
  views24h: number;
  views7d: number;
  velocityScore: number;
  content?: Record<string, unknown>; // The actual content data
}

interface TrendingData {
  events: TrendingItem[];
  restaurants: TrendingItem[];
  attractions: TrendingItem[];
  playgrounds: TrendingItem[];
}

interface FallbackConfig {
  useRealData: boolean;
  minItemsRequired: number;
  fallbackSeed: number; // For consistent "fake" trending
}

export function useTrending(config: FallbackConfig = { useRealData: true, minItemsRequired: 3, fallbackSeed: 42 }) {
  const [trending, setTrending] = useState<TrendingData>({
    events: [],
    restaurants: [],
    attractions: [],
    playgrounds: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [hasRealData, setHasRealData] = useState(false);

  useEffect(() => {
    fetchTrendingData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTrendingData = async () => {
    try {
      setIsLoading(true);

      if (config.useRealData) {
        // Fetch real trending data
        const { data: trendingScores } = await supabase
          .from('trending_scores')
          .select('*')
          .eq('date', new Date().toISOString().split('T')[0])
          .order('rank')
          .limit(10);

        if (trendingScores && trendingScores.length > 0) {
          // We have real data! Fetch the actual content
          const enrichedTrending = await enrichTrendingWithContent(trendingScores);
          
          const groupedTrending = groupTrendingByType(enrichedTrending);
          
          // Check if we have enough data
          const totalItems = Object.values(groupedTrending).reduce((sum, items) => sum + items.length, 0);
          
          if (totalItems >= config.minItemsRequired) {
            setTrending(groupedTrending);
            setHasRealData(true);
            setIsLoading(false);
            return;
          }
        }
      }

      // Fallback: Generate smart trending based on featured/recent content
      const fallbackTrending = await generateFallbackTrending();
      setTrending(fallbackTrending);
      setHasRealData(false);
      
    } catch (error) {
      console.error('Error fetching trending data:', error);
      // Generate fallback trending on error
      const fallbackTrending = await generateFallbackTrending();
      setTrending(fallbackTrending);
      setHasRealData(false);
    } finally {
      setIsLoading(false);
    }
  };

  const enrichTrendingWithContent = async (trendingScores: Array<Record<string, unknown>>) => {
    // Batch content lookups: one query per content type via .in('id', ids)
    // instead of a per-item awaited query (WEB-PERF-012).
    const idsByType: Record<string, string[]> = {
      event: [],
      restaurant: [],
      attraction: [],
      playground: [],
    };

    for (const score of trendingScores) {
      const type = score.content_type as string;
      const id = score.content_id as string;
      if (idsByType[type] && id) {
        idsByType[type].push(id);
      }
    }

    // A map keyed by `${type}:${id}` so results can be re-associated in order.
    const contentByKey = new Map<string, Record<string, unknown>>();

    try {
      const [eventsRes, restaurantsRes, attractionsRes, playgroundsRes] = await Promise.all([
        idsByType.event.length
          ? supabase
              .from('events')
              .select(EVENT_LIST_COLUMNS)
              .in('id', idsByType.event)
              .neq('is_hidden', true) // Exclude soft-hidden stale events (WEB-AUTO-006)
          : null,
        idsByType.restaurant.length
          ? supabase.from('restaurants').select(RESTAURANT_LIST_COLUMNS).in('id', idsByType.restaurant)
          : null,
        idsByType.attraction.length
          ? supabase.from('attractions').select(ATTRACTION_LIST_COLUMNS).in('id', idsByType.attraction)
          : null,
        idsByType.playground.length
          ? supabase.from('playgrounds').select('*').in('id', idsByType.playground) // No playground LIST_COLUMNS constant
          : null,
      ]);

      const collect = (type: string, rows: unknown) => {
        for (const row of (rows as Array<Record<string, unknown>>) || []) {
          contentByKey.set(`${type}:${row.id}`, row);
        }
      };

      collect('event', eventsRes?.data);
      collect('restaurant', restaurantsRes?.data);
      collect('attraction', attractionsRes?.data);
      collect('playground', playgroundsRes?.data);
    } catch (error) {
      console.error('Error batch-fetching trending content', error);
    }

    // Re-associate content in the original trending order.
    const enriched = [];
    for (const score of trendingScores) {
      const content = contentByKey.get(`${score.content_type}:${score.content_id}`);
      if (content) {
        enriched.push({
          id: score.id,
          contentType: score.content_type,
          contentId: score.content_id,
          score: score.score,
          rank: score.rank,
          views24h: score.views_24h,
          views7d: score.views_7d,
          velocityScore: score.velocity_score,
          content
        });
      }
    }

    return enriched;
  };

  const generateFallbackTrending = async (): Promise<TrendingData> => {
    // Create smart fallback based on featured content, recent additions, and algorithmic selection
    const fallback: TrendingData = {
      events: [],
      restaurants: [],
      attractions: [],
      playgrounds: []
    };

    try {
      // Fetch featured and recent events
      const { data: featuredEvents } = await supabase
        .from('events')
        .select('*')
        .eq('is_featured', true)
        .neq('is_hidden', true) // Exclude soft-hidden stale events (WEB-AUTO-006)
        .order('created_at', { ascending: false })
        .limit(6);

      const { data: recentEvents } = await supabase
        .from('events')
        .select('*')
        .gte('date', new Date().toISOString())
        .order('date')
        .limit(6);

      // Combine and dedupe events
      const allEvents = [...(featuredEvents || []), ...(recentEvents || [])];
      const uniqueEvents = allEvents.filter((event, index, self) => 
        index === self.findIndex(e => e.id === event.id)
      );

      // Create mock trending items with realistic-looking scores
      fallback.events = uniqueEvents.slice(0, 6).map((event, index) => ({
        id: `fallback-event-${event.id}`,
        contentType: 'event' as const,
        contentId: event.id,
        score: 100 - (index * 15), // Decreasing scores
        rank: index + 1,
        views24h: Math.max(50 - (index * 8), 5),
        views7d: Math.max(200 - (index * 30), 20),
        velocityScore: Math.max(20 - (index * 3), 2),
        content: event
      }));

      // Similar for restaurants (using featured)
      const { data: restaurants } = await supabase
        .from('restaurants')
        .select('*')
        .eq('is_featured', true)
        .order('created_at', { ascending: false })
        .limit(4);

      fallback.restaurants = (restaurants || []).map((restaurant, index) => ({
        id: `fallback-restaurant-${restaurant.id}`,
        contentType: 'restaurant' as const,
        contentId: restaurant.id,
        score: 80 - (index * 12),
        rank: index + 1,
        views24h: Math.max(30 - (index * 5), 3),
        views7d: Math.max(150 - (index * 20), 15),
        velocityScore: Math.max(15 - (index * 2), 1),
        content: restaurant
      }));

      // Similar for attractions
      const { data: attractions } = await supabase
        .from('attractions')
        .select('*')
        .eq('is_featured', true)
        .order('created_at', { ascending: false })
        .limit(4);

      fallback.attractions = (attractions || []).map((attraction, index) => ({
        id: `fallback-attraction-${attraction.id}`,
        contentType: 'attraction' as const,
        contentId: attraction.id,
        score: 70 - (index * 10),
        rank: index + 1,
        views24h: Math.max(25 - (index * 4), 2),
        views7d: Math.max(120 - (index * 15), 12),
        velocityScore: Math.max(12 - (index * 2), 1),
        content: attraction
      }));

      // Similar for playgrounds
      const { data: playgrounds } = await supabase
        .from('playgrounds')
        .select('*')
        .eq('is_featured', true)
        .order('created_at', { ascending: false })
        .limit(4);

      fallback.playgrounds = (playgrounds || []).map((playground, index) => ({
        id: `fallback-playground-${playground.id}`,
        contentType: 'playground' as const,
        contentId: playground.id,
        score: 60 - (index * 8),
        rank: index + 1,
        views24h: Math.max(20 - (index * 3), 1),
        views7d: Math.max(100 - (index * 12), 10),
        velocityScore: Math.max(10 - (index * 1), 1),
        content: playground
      }));

    } catch (error) {
      console.error('Error generating fallback trending:', error);
    }

    return fallback;
  };

  const groupTrendingByType = (trendingItems: TrendingItem[]): TrendingData => {
    return trendingItems.reduce((acc, item) => {
      acc[`${item.contentType}s` as keyof TrendingData].push(item);
      return acc;
    }, {
      events: [],
      restaurants: [],
      attractions: [],
      playgrounds: []
    } as TrendingData);
  };

  return {
    trending,
    isLoading,
    hasRealData,
    refetch: fetchTrendingData
  };
}