import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ANALYTICS_SCAN_LIMIT, fetchVisibleContent, isTrendingContentType } from '@/lib/trendingContent';
import { createLogger } from '@/lib/logger';

const logger = createLogger('useTrendingContent');

type TrendingContentType = 'event' | 'restaurant' | 'attraction' | 'playground';
type TrendingWindow = '1h' | '6h' | '24h' | '7d';

interface TrendingItem {
  id: string;
  contentType: TrendingContentType;
  contentId: string;
  content: Record<string, unknown>;
  trendingScore: number;
  timeWindow: TrendingWindow;
  reason: string;
}

interface TrendingOptions {
  contentType?: TrendingContentType;
  timeWindow?: TrendingWindow;
  limit?: number;
  includeContent?: boolean;
}

const WINDOW_MS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

function getTimeThreshold(window: string): string {
  return new Date(Date.now() - (WINDOW_MS[window] ?? WINDOW_MS['24h'])).toISOString();
}

function generateTrendingReason(item: Record<string, unknown>, window: string): string {
  const score = (item[`score_${window}`] as number) || (item.score as number) || 0;
  const views = (item[`unique_views_${window}`] as number) || (item.views as number) || 0;

  if (score > 50) return 'Viral';
  if (score > 20) return 'Hot';
  if (views > 100) return 'Popular';
  if ((item.velocity_score as number) > 10) return 'Rising';
  return 'Trending';
}

// Fallback method to calculate trending from existing analytics
async function calculateTrendingFromAnalytics(
  contentType: TrendingContentType | undefined,
  timeWindow: TrendingWindow,
  limit: number,
) {
  try {
    let query = supabase
      .from('user_analytics')
      .select('content_type, content_id, event_type')
      .gte('created_at', getTimeThreshold(timeWindow))
      // Newest first and bounded; this scanned the whole window unbounded.
      .order('created_at', { ascending: false })
      .limit(ANALYTICS_SCAN_LIMIT);

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
    logger.error('calculateTrendingFromAnalytics', 'Error calculating trending from analytics', { error });
    return [];
  }
}

async function fetchTrendingItems(
  contentType: TrendingContentType | undefined,
  timeWindow: TrendingWindow,
  limit: number,
  includeContent: boolean,
): Promise<TrendingItem[]> {
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
    logger.debug('fetchTrendingItems', 'Enhanced trending not available, using fallback method');
    // Fallback to calculating trending from existing analytics
    trendingData = await calculateTrendingFromAnalytics(contentType, timeWindow, limit);
  }

  if (!trendingData || trendingData.length === 0) return [];

  // Batch-fetch content per type in a single .in() query each — no more
  // one-query-per-item N+1. (WEB-PERF-002)
  const contentByKey = new Map<string, Record<string, unknown>>();
  if (includeContent) {
    const idsByType = new Map<string, string[]>();
    for (const item of trendingData) {
      const list = idsByType.get(item.content_type) || [];
      list.push(item.content_id);
      idsByType.set(item.content_type, list);
    }
    await Promise.all(
      Array.from(idsByType.entries()).map(async ([type, ids]) => {
        if (!isTrendingContentType(type)) return;
        try {
          // Visible rows only: past, hidden, merged and inactive rows come
          // back absent and the item is dropped below. This was select('*')
          // with no filter, so a long-past event could list as trending.
          for (const [key, row] of await fetchVisibleContent(type, ids)) contentByKey.set(key, row);
        } catch (_contentError) {
          logger.debug('fetchTrendingItems', 'Could not batch-fetch content', { type });
        }
      })
    );
  }

  return trendingData
    .filter((item) => !includeContent || contentByKey.has(`${item.content_type}:${item.content_id}`))
    .map((item) => ({
      id: item.id || `${item.content_type}-${item.content_id}`,
      contentType: item.content_type,
      contentId: item.content_id,
      content: contentByKey.get(`${item.content_type}:${item.content_id}`) ?? null,
      trendingScore: item[`score_${timeWindow}`] || item.score || 0,
      timeWindow,
      reason: generateTrendingReason(item, timeWindow),
    }));
}

/**
 * Trending content for the TrendingContent rail.
 *
 * Was `useTrending`, the name useTrending.ts also exports, so which one a
 * caller got depended on the import path. It was also a useState/useEffect
 * fetch, which PrerenderSignal cannot see (it counts TanStack queries only),
 * so a prerender capture could land before its rows did.
 */
export function useTrendingContent(options: TrendingOptions = {}) {
  const {
    contentType,
    timeWindow = '24h',
    limit = 10,
    includeContent = true,
  } = options;

  const query = useQuery({
    queryKey: ['trending-content', contentType ?? 'all', timeWindow, limit, includeContent],
    queryFn: async () => {
      try {
        return await fetchTrendingItems(contentType, timeWindow, limit, includeContent);
      } catch (err) {
        logger.error('fetchTrendingItems', 'Error fetching trending items', { error: err });
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    trendingItems: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ? 'Failed to load trending content' : null,
    refreshTrending: () => {
      void query.refetch();
    },
    timeWindow,
    contentType,
  };
}
