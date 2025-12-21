import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TrendingItem {
  id: string;
  contentType: 'event' | 'restaurant' | 'attraction' | 'playground';
  contentId: string;
  content: Record<string, unknown>;
  trendingScore: number;
  timeWindow: '1h' | '6h' | '24h' | '7d';
  reason: string;
}

interface TrendingOptions {
  contentType?: 'event' | 'restaurant' | 'attraction' | 'playground';
  timeWindow?: '1h' | '6h' | '24h' | '7d';
  limit?: number;
  includeContent?: boolean;
}

export function useTrending(options: TrendingOptions = {}) {
  const [trendingItems, setTrendingItems] = useState<TrendingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    contentType,
    timeWindow = '24h',
    limit = 10,
    includeContent = true
  } = options;

  useEffect(() => {
    fetchTrendingItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentType, timeWindow, limit]);

  const fetchTrendingItems = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Try to use enhanced trending scores first
      let trendingData;
      try {
        let query = supabase
          .from('trending_scores_realtime' as never)
          .select('*')
          .eq('date', new Date().toISOString().split('T')[0])
          .order(`score_${timeWindow}`, { ascending: false })
          .limit(limit);

        if (contentType) {
          query = query.eq('content_type', contentType);
        }

        const { data: enhancedData, error: enhancedError } = await query;
        
        if (enhancedError) throw enhancedError;
        trendingData = enhancedData;
      } catch (_enhancedError) {
        console.log('Enhanced trending not available, using fallback method');
        // Fallback to calculating trending from existing analytics
        trendingData = await calculateTrendingFromAnalytics();
      }

      if (!trendingData || trendingData.length === 0) {
        setTrendingItems([]);
        setIsLoading(false);
        return;
      }

      // Fetch actual content if requested
      const enrichedItems: TrendingItem[] = [];
      
      for (const item of trendingData) {
        let content = null;
        
        if (includeContent) {
          try {
            const tableName = getTableName(item.content_type);
            const { data: contentData } = await supabase
              .from(tableName as never)
              .select('*')
              .eq('id', item.content_id)
              .single();
            content = contentData;
          } catch (_contentError) {
            console.log(`Could not fetch content for ${item.content_type}:${item.content_id}`);
          }
        }

        enrichedItems.push({
          id: item.id || `${item.content_type}-${item.content_id}`,
          contentType: item.content_type,
          contentId: item.content_id,
          content,
          trendingScore: item[`score_${timeWindow}`] || item.score || 0,
          timeWindow,
          reason: generateTrendingReason(item, timeWindow)
        });
      }

      setTrendingItems(enrichedItems);
    } catch (err) {
      console.error('Error fetching trending items:', err);
      setError('Failed to load trending content');
    } finally {
      setIsLoading(false);
    }
  };

  // Fallback method to calculate trending from existing analytics
  const calculateTrendingFromAnalytics = async () => {
    try {
      const timeThreshold = getTimeThreshold(timeWindow);
      
      let query = supabase
        .from('user_analytics')
        .select('content_type, content_id, event_type')
        .gte('created_at', timeThreshold);

      if (contentType) {
        query = query.eq('content_type', contentType);
      }

      const { data: analyticsData } = await query;

      if (!analyticsData) return [];

      // Calculate trending scores
      const contentScores: { [key: string]: { content_type: string; content_id: string; views: number; clicks: number; shares: number; score: number } } = {};
      
      analyticsData.forEach(item => {
        const key = `${item.content_type}:${item.content_id}`;
        if (!contentScores[key]) {
          contentScores[key] = {
            content_type: item.content_type,
            content_id: item.content_id,
            views: 0,
            clicks: 0,
            shares: 0,
            score: 0
          };
        }
        
        // Weight different event types
        switch (item.event_type) {
          case 'view':
            contentScores[key].views += 1;
            contentScores[key].score += 1;
            break;
          case 'click':
            contentScores[key].clicks += 1;
            contentScores[key].score += 2;
            break;
          case 'share':
            contentScores[key].shares += 1;
            contentScores[key].score += 5;
            break;
          case 'bookmark':
            contentScores[key].score += 3;
            break;
        }
      });

      // Sort by score and return top items
      return Object.values(contentScores)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
        
    } catch (error) {
      console.error('Error calculating trending from analytics:', error);
      return [];
    }
  };

  const getTimeThreshold = (window: string): string => {
    const now = new Date();
    switch (window) {
      case '1h':
        return new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      case '6h':
        return new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      default:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    }
  };

  const getTableName = (contentType: string): string => {
    switch (contentType) {
      case 'event':
        return 'events';
      case 'restaurant':
        return 'restaurants';
      case 'attraction':
        return 'attractions';
      case 'playground':
        return 'playgrounds';
      default:
        return 'events';
    }
  };

  const generateTrendingReason = (item: Record<string, unknown>, window: string): string => {
    const score = (item[`score_${window}`] as number) || (item.score as number) || 0;
    const views = (item[`unique_views_${window}`] as number) || (item.views as number) || 0;
    
    if (score > 50) return 'Viral';
    if (score > 20) return 'Hot';
    if (views > 100) return 'Popular';
    if ((item.velocity_score as number) > 10) return 'Rising';
    return 'Trending';
  };

  const refreshTrending = () => {
    fetchTrendingItems();
  };

  return {
    trendingItems,
    isLoading,
    error,
    refreshTrending,
    timeWindow,
    contentType
  };
}
