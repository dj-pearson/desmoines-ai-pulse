import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PopularSearch {
  query: string;
  count: number;
  category?: string;
  trending: boolean; // Is it trending upward?
}

interface SearchInsights {
  popularSearches: PopularSearch[];
  trendingQueries: PopularSearch[];
  categoryBreakdown: { [key: string]: number };
  recentSearches: string[];
}

export function useSearchInsights() {
  const [insights, setInsights] = useState<SearchInsights>({
    popularSearches: [],
    trendingQueries: [],
    categoryBreakdown: {},
    recentSearches: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [hasRealData, setHasRealData] = useState(false);

  useEffect(() => {
    fetchSearchInsights();
  }, []);

  const fetchSearchInsights = async () => {
    try {
      setIsLoading(true);

      // Try to get real search data from the last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: searchData, error } = await supabase
        .from('search_analytics')
        .select('query, category, created_at')
        .gte('created_at', sevenDaysAgo.toISOString())
        .not('query', 'is', null)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching search data:', error);
        setInsights(generateFallbackInsights());
        setHasRealData(false);
        return;
      }

      if (searchData && searchData.length >= 10) {
        // We have enough real data
        const realInsights = processRealSearchData(searchData);
        setInsights(realInsights);
        setHasRealData(true);
      } else {
        // Not enough data, use fallback
        setInsights(generateFallbackInsights());
        setHasRealData(false);
      }

    } catch (error) {
      console.error('Error fetching search insights:', error);
      setInsights(generateFallbackInsights());
      setHasRealData(false);
    } finally {
      setIsLoading(false);
    }
  };

  const processRealSearchData = (searchData: any[]): SearchInsights => {
    // Count query frequency
    const queryCount: { [key: string]: { count: number; category?: string; recent: boolean } } = {};
    
    searchData.forEach((search, index) => {
      const query = search.query.toLowerCase().trim();
      if (query.length < 2) return; // Skip very short queries
      
      if (!queryCount[query]) {
        queryCount[query] = { count: 0, category: search.category, recent: index < 20 };
      }
      queryCount[query].count++;
    });

    // Calculate trending (simple velocity based on recency)
    const now = new Date();
    const trending: { [key: string]: number } = {};
    
    searchData.forEach((search) => {
      const query = search.query.toLowerCase().trim();
      const age = (now.getTime() - new Date(search.created_at).getTime()) / (1000 * 60 * 60); // hours
      const recencyScore = Math.max(0, 24 - age) / 24; // Higher score for more recent
      trending[query] = (trending[query] || 0) + recencyScore;
    });

    // Create popular searches
    const popularSearches = Object.entries(queryCount)
      .filter(([_, data]) => data.count >= 2) // Minimum threshold
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 10)
      .map(([query, data]) => ({
        query,
        count: data.count,
        category: data.category,
        trending: (trending[query] || 0) > 2 // Has recent activity
      }));

    // Create trending queries (high velocity)
    const trendingQueries = Object.entries(trending)
      .filter(([query]) => queryCount[query]?.count >= 2)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([query]) => ({
        query,
        count: queryCount[query].count,
        category: queryCount[query].category,
        trending: true
      }));

    // Category breakdown
    const categoryBreakdown: { [key: string]: number } = {};
    searchData.forEach((search) => {
      if (search.category) {
        categoryBreakdown[search.category] = (categoryBreakdown[search.category] || 0) + 1;
      }
    });

    // Recent unique searches
    const recentSearches = Array.from(new Set(
      searchData.slice(0, 50).map(s => s.query)
    )).slice(0, 10);

    return {
      popularSearches,
      trendingQueries,
      categoryBreakdown,
      recentSearches
    };
  };

  const generateFallbackInsights = (): SearchInsights => {
    // Generate realistic fallback data based on Des Moines interests
    const fallbackPopular: PopularSearch[] = [
      { query: 'farmers market', count: 45, category: 'Events', trending: true },
      { query: 'downtown events', count: 38, category: 'Events', trending: false },
      { query: 'free activities', count: 35, category: 'Events', trending: true },
      { query: 'pizza', count: 32, category: 'Restaurants', trending: false },
      { query: 'craft beer', count: 28, category: 'Restaurants', trending: true },
      { query: 'playgrounds', count: 25, category: 'Playgrounds', trending: false },
      { query: 'art galleries', count: 22, category: 'Attractions', trending: true },
      { query: 'music venues', count: 20, category: 'Events', trending: false },
      { query: 'family activities', count: 18, category: 'Events', trending: true },
      { query: 'brunch', count: 16, category: 'Restaurants', trending: false }
    ];

    const fallbackTrending: PopularSearch[] = [
      { query: 'summer festivals', count: 15, category: 'Events', trending: true },
      { query: 'outdoor dining', count: 12, category: 'Restaurants', trending: true },
      { query: 'bike trails', count: 10, category: 'Attractions', trending: true },
      { query: 'food trucks', count: 9, category: 'Restaurants', trending: true },
      { query: 'live music', count: 8, category: 'Events', trending: true },
      { query: 'splash pads', count: 7, category: 'Playgrounds', trending: true }
    ];

    const fallbackCategories = {
      'Events': 156,
      'Restaurants': 89,
      'Attractions': 43,
      'Playgrounds': 27
    };

    const fallbackRecent = [
      'coffee shops near me',
      'weekend events',
      'kids activities',
      'date night restaurants',
      'free parking downtown'
    ];

    return {
      popularSearches: fallbackPopular,
      trendingQueries: fallbackTrending,
      categoryBreakdown: fallbackCategories,
      recentSearches: fallbackRecent
    };
  };

  return {
    insights,
    isLoading,
    hasRealData,
    refetch: fetchSearchInsights
  };
}