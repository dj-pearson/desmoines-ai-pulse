import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface SimpleRecommendation {
  id: string;
  contentType: 'event' | 'restaurant' | 'attraction' | 'playground';
  content: any;
  score: number;
  reason: string;
}

interface RecommendationOptions {
  contentType?: 'event' | 'restaurant' | 'attraction' | 'playground';
  limit?: number;
  context?: 'homepage' | 'search' | 'detail' | 'category';
}

export function useSimplePersonalization(options: RecommendationOptions = {}) {
  const { user } = useAuth();
  const [recommendations, setRecommendations] = useState<SimpleRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionId] = useState(() => crypto.randomUUID());

  const {
    contentType,
    limit = 5,
    context = 'homepage'
  } = options;

  useEffect(() => {
    generateRecommendations();
  }, [user?.id, contentType, limit, context]);

  const generateRecommendations = async () => {
    try {
      setIsLoading(true);

      // Get user preferences from search history
      const userPreferences = await getUserPreferencesFromSearch();
      
      // Get trending content
      const trendingContent = await getTrendingContent();
      
      // Get user's recent activity
      const recentActivity = await getUserRecentActivity();
      
      // Combine and score recommendations
      const scoredRecommendations = await combineAndScoreRecommendations(
        userPreferences,
        trendingContent,
        recentActivity
      );

      setRecommendations(scoredRecommendations);
    } catch (error) {
      console.error('Error generating recommendations:', error);
      // Fallback to popular content
      const fallbackRecommendations = await getFallbackRecommendations();
      setRecommendations(fallbackRecommendations);
    } finally {
      setIsLoading(false);
    }
  };

  const getUserPreferencesFromSearch = async () => {
    if (!user?.id) return null;

    try {
      const { data: searches } = await supabase
        .from('search_analytics')
        .select('query, category, location, price_filter')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!searches || searches.length === 0) return null;

      // Analyze search patterns
      const categories = searches.map(s => s.category).filter(Boolean);
      const locations = searches.map(s => s.location).filter(Boolean);
      const priceRanges = searches.map(s => s.price_filter).filter(Boolean);

      return {
        preferredCategories: getTopItems(categories, 3),
        preferredLocations: getTopItems(locations, 3),
        preferredPriceRanges: getTopItems(priceRanges, 2),
        searchCount: searches.length
      };
    } catch (error) {
      console.log('Error getting user preferences:', error);
      return null;
    }
  };

  const getTrendingContent = async () => {
    try {
      const timeThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      let query = supabase
        .from('user_analytics')
        .select('content_type, content_id, event_type')
        .gte('created_at', timeThreshold);

      if (contentType) {
        query = query.eq('content_type', contentType);
      }

      const { data: analytics } = await query;

      if (!analytics) return [];

      // Calculate trending scores
      const contentScores: { [key: string]: any } = {};
      
      analytics.forEach(item => {
        const key = `${item.content_type}:${item.content_id}`;
        if (!contentScores[key]) {
          contentScores[key] = {
            content_type: item.content_type,
            content_id: item.content_id,
            score: 0,
            reason: 'trending'
          };
        }
        
        switch (item.event_type) {
          case 'view': contentScores[key].score += 1; break;
          case 'click': contentScores[key].score += 2; break;
          case 'share': contentScores[key].score += 5; break;
          case 'bookmark': contentScores[key].score += 3; break;
        }
      });

      return Object.values(contentScores)
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 20);
        
    } catch (error) {
      console.log('Error getting trending content:', error);
      return [];
    }
  };

  const getUserRecentActivity = async () => {
    if (!user?.id) return [];

    try {
      const { data: recentViews } = await supabase
        .from('user_analytics')
        .select('content_type, content_id, event_type, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      return recentViews || [];
    } catch (error) {
      console.log('Error getting recent activity:', error);
      return [];
    }
  };

  const combineAndScoreRecommendations = async (
    preferences: any,
    trending: any[],
    activity: any[]
  ): Promise<SimpleRecommendation[]> => {
    const recommendations: SimpleRecommendation[] = [];
    const seenContentIds = new Set();

    // Add trending content with preference boost
    for (const item of trending.slice(0, limit * 2)) {
      if (seenContentIds.has(item.content_id)) continue;
      
      let score = item.score;
      let reason = 'Popular right now';

      // Boost score based on user preferences
      if (preferences) {
        if (preferences.preferredCategories.includes(item.content_type)) {
          score *= 1.5;
          reason = 'Matches your interests';
        }
      }

      // Get actual content
      try {
        const tableName = getTableName(item.content_type);
        const { data: content } = await supabase
          .from(tableName as any)
          .select('*')
          .eq('id', item.content_id)
          .single();

        if (content) {
          recommendations.push({
            id: `rec-${item.content_id}`,
            contentType: item.content_type,
            content,
            score,
            reason
          });
          seenContentIds.add(item.content_id);
        }
      } catch (error) {
        console.log(`Could not fetch content for ${item.content_type}:${item.content_id}`);
      }
    }

    // If we don't have enough recommendations, add popular content
    if (recommendations.length < limit) {
      const popularContent = await getPopularContent(limit - recommendations.length, seenContentIds);
      recommendations.push(...popularContent);
    }

    // Sort by score and return top items
    return recommendations
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  };

  const getPopularContent = async (needed: number, excludeIds: Set<string>): Promise<SimpleRecommendation[]> => {
    const popular: SimpleRecommendation[] = [];
    
    try {
      const tables = contentType ? [getTableName(contentType)] : ['events', 'restaurants', 'attractions', 'playgrounds'];
      
      for (const table of tables) {
        const { data: content } = await supabase
          .from(table as any)
          .select('*')
          .order('created_at', { ascending: false })
          .limit(needed);

        if (content) {
          content.forEach((item: any) => {
            if (!excludeIds.has(item.id) && popular.length < needed) {
              popular.push({
                id: `pop-${item.id}`,
                contentType: getContentTypeFromTable(table),
                content: item,
                score: 10, // Base score for popular content
                reason: 'Recently added'
              });
            }
          });
        }
      }
    } catch (error) {
      console.log('Error getting popular content:', error);
    }

    return popular;
  };

  const getFallbackRecommendations = async (): Promise<SimpleRecommendation[]> => {
    return getPopularContent(limit, new Set());
  };

  const getTableName = (contentType: string): string => {
    switch (contentType) {
      case 'event': return 'events';
      case 'restaurant': return 'restaurants';
      case 'attraction': return 'attractions';
      case 'playground': return 'playgrounds';
      default: return 'events';
    }
  };

  const getContentTypeFromTable = (table: string): 'event' | 'restaurant' | 'attraction' | 'playground' => {
    switch (table) {
      case 'events': return 'event';
      case 'restaurants': return 'restaurant';
      case 'attractions': return 'attraction';
      case 'playgrounds': return 'playground';
      default: return 'event';
    }
  };

  const trackRecommendationClick = async (recommendation: SimpleRecommendation) => {
    try {
      await supabase.from('user_analytics').insert({
        session_id: sessionId,
        user_id: user?.id,
        event_type: 'click',
        content_type: recommendation.contentType,
        content_id: recommendation.content.id,
        device_type: getMobileDetect(),
        user_agent: navigator.userAgent,
        page_url: window.location.href
      });
    } catch (error) {
      console.log('Error tracking recommendation click:', error);
    }
  };

  return {
    recommendations,
    isLoading,
    generateRecommendations,
    trackRecommendationClick
  };
}

function getTopItems(items: string[], count: number): string[] {
  const frequency: { [key: string]: number } = {};
  items.forEach(item => {
    frequency[item] = (frequency[item] || 0) + 1;
  });
  
  return Object.entries(frequency)
    .sort(([,a], [,b]) => b - a)
    .slice(0, count)
    .map(([item]) => item);
}

function getMobileDetect(): string {
  const userAgent = navigator.userAgent;
  if (/tablet|ipad|playbook|silk/i.test(userAgent)) return 'tablet';
  if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(userAgent)) return 'mobile';
  return 'desktop';
}
