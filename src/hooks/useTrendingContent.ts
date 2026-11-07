import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ANALYTICS_SCAN_LIMIT, fetchVisibleContent, isTrendingContentType } from '@/lib/trendingContent';
import { createLogger } from '@/lib/logger';
import { centralDateOf } from '@/lib/timezone';

const logger = createLogger('useTrendingContent');

type ContentType = 'event' | 'restaurant' | 'attraction' | 'playground';
type TimeWindow = '1h' | '6h' | '24h' | '7d';

interface TrendingItem {
  id: string;
  contentType: ContentType;
  contentId: string;
  content: Record<string, unknown>;
  trendingScore: number;
  timeWindow: TimeWindow;
  reason: string;
}

interface TrendingOptions {
  contentType?: ContentType;
  timeWindow?: TimeWindow;
  limit?: number;
  includeContent?: boolean;
}

/** A score row from trending_scores_realtime, or one computed from user_analytics. */
type ScoreRow = Record<string, unknown> & { content_type: string; content_id: string };

function getTimeThreshold(window: TimeWindow): string {
  const hours = { '1h': 1, '6h': 6, '24h': 24, '7d': 24 * 7 }[window] ?? 24;
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function generateTrendingReason(item: Record<string, unknown>, window: TimeWindow): string {
  const score = (item[`score_${window}`] as number) || (item.score as number) || 0;
  const views = (item[`unique_views_${window}`] as number) || (item.views as number) || 0;

  if (score > 50) return 'Viral';
  if (score > 20) return 'Hot';
  if (views > 100) return 'Popular';
  if ((item.velocity_score as number) > 10) return 'Rising';
  return 'Trending';
}

/**
 * Today's precomputed scores.
 *
 * The bucket is `date DATE DEFAULT CURRENT_DATE`, written by
 * update_trending_scores() in the database's own timezone. This asked for
 * `.eq('date', <UTC date>)`, which agreed with a UTC database by accident and
 * with nothing else. Asking for every bucket from today's CENTRAL date onward
 * covers both readings of "today": a UTC server is never behind Central, so
 * its current bucket is today's Central date or the next one. Newest bucket
 * first, and a row that appears in both is kept once.
 */
async function fetchScoreRows(
  contentType: ContentType | undefined,
  timeWindow: TimeWindow,
  limit: number,
): Promise<ScoreRow[]> {
  let query = supabase
    .from('trending_scores_realtime' as never)
    .select('*')
    .gte('date', centralDateOf())
    .order('date', { ascending: false })
    .order(`score_${timeWindow}`, { ascending: false })
    // Room for the same item in two buckets.
    .limit(limit * 2);

  if (contentType) {
    query = query.eq('content_type', contentType);
  }

  const { data, error } = await query;
  if (error) throw error;

  const seen = new Set<string>();
  const rows: ScoreRow[] = [];
  for (const row of (data ?? []) as ScoreRow[]) {
    const key = `${row.content_type}:${row.content_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
    if (rows.length === limit) break;
  }
  return rows;
}

/** Fallback: score from raw user_analytics when the precomputed table is unavailable. */
async function calculateTrendingFromAnalytics(
  contentType: ContentType | undefined,
  timeWindow: TimeWindow,
  limit: number,
): Promise<ScoreRow[]> {
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

  // A failure here throws, so the component shows a retryable error instead
  // of "No trending content" for a list it never got to read.
  const { data: analyticsData, error } = await query;
  if (error) throw error;
  if (!analyticsData) return [];

  const contentScores: Record<string, ScoreRow & { views: number; clicks: number; shares: number; score: number }> = {};

  analyticsData.forEach((item) => {
    const key = `${item.content_type}:${item.content_id}`;
    if (!contentScores[key]) {
      contentScores[key] = {
        content_type: item.content_type,
        content_id: item.content_id,
        views: 0,
        clicks: 0,
        shares: 0,
        score: 0,
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

  return Object.values(contentScores)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function fetchTrendingItems(
  contentType: ContentType | undefined,
  timeWindow: TimeWindow,
  limit: number,
  includeContent: boolean,
): Promise<TrendingItem[]> {
  let trendingData: ScoreRow[];
  try {
    trendingData = await fetchScoreRows(contentType, timeWindow, limit);
  } catch (_enhancedError) {
    logger.debug('fetchTrendingItems', 'Enhanced trending not available, using fallback method');
    trendingData = await calculateTrendingFromAnalytics(contentType, timeWindow, limit);
  }

  if (trendingData.length === 0) return [];

  // Batch-fetch content per type in a single .in() query each - no more
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
      }),
    );
  }

  return trendingData
    .filter((item) => !includeContent || contentByKey.has(`${item.content_type}:${item.content_id}`))
    .map((item) => ({
      id: (item.id as string) || `${item.content_type}-${item.content_id}`,
      contentType: item.content_type as ContentType,
      contentId: item.content_id,
      content: contentByKey.get(`${item.content_type}:${item.content_id}`) ?? null,
      trendingScore: (item[`score_${timeWindow}`] as number) || (item.score as number) || 0,
      timeWindow,
      reason: generateTrendingReason(item, timeWindow),
    }));
}

/**
 * Trending items for the Social "Trending" tab.
 *
 * This was a hand-rolled useState/useEffect cycle: no cache across tab
 * switches, no retries, and a failure that the component could only show as a
 * dead end. TanStack Query owns all three now, and `refetch` is what the
 * component's Retry button calls.
 */
export function useTrending(options: TrendingOptions = {}) {
  const { contentType, timeWindow = '24h', limit = 10, includeContent = true } = options;

  const query = useQuery({
    // The Central date is in the key so the cache rolls over at Des Moines
    // midnight rather than serving yesterday's bucket.
    queryKey: ['trending-content', { contentType: contentType ?? null, timeWindow, limit, includeContent, day: centralDateOf() }],
    queryFn: () => fetchTrendingItems(contentType, timeWindow, limit, includeContent),
    staleTime: 5 * 60 * 1000,
  });

  return {
    trendingItems: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refreshTrending: query.refetch,
    timeWindow,
    contentType,
  };
}
