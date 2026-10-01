import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { handleError } from '@/lib/errorHandler';
import {
  ANALYTICS_SCAN_LIMIT,
  fetchRecentVisibleContent,
  fetchVisibleContent,
  isTrendingContentType,
  type TrendingContentType,
} from '@/lib/trendingContent';

interface SimpleRecommendation {
  id: string;
  contentType: TrendingContentType;
  content: Record<string, unknown>;
  score: number;
  reason: string;
}

interface ScoredItem {
  content_type: TrendingContentType;
  content_id: string;
  score: number;
}

interface SearchPreferences {
  preferredCategories: string[];
  preferredLocations: string[];
  preferredPriceRanges: string[];
  searchCount: number;
}

const EVENT_WEIGHTS: Record<string, number> = { view: 1, click: 2, share: 5, bookmark: 3 };

interface RecommendationOptions {
  contentType?: TrendingContentType;
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
      
      // Combine and score recommendations
      const scoredRecommendations = await combineAndScoreRecommendations(userPreferences, trendingContent);

      setRecommendations(scoredRecommendations);
    } catch (error) {
      handleError(error, { component: 'useSimplePersonalization', action: 'generateRecommendations' });
      // Fallback to popular content
      const fallbackRecommendations = await getFallbackRecommendations();
      setRecommendations(fallbackRecommendations);
    } finally {
      setIsLoading(false);
    }
  };

  const getUserPreferencesFromSearch = async (): Promise<SearchPreferences | null> => {
    if (!user?.id) return null;

    try {
      const { data: searches, error } = await supabase
        .from('search_analytics')
        // Facets live in the `search_filters` JSON, not as columns (WEB-QA-012).
        .select('search_query, search_filters')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      // Silently handle permission errors
      if (error) return null;
      if (!searches || searches.length === 0) return null;

      // Analyze search patterns
      // Facets live inside the `search_filters` JSON, not as columns (WEB-QA-012).
      const facets = (s: { search_filters: unknown }) =>
        (s.search_filters ?? {}) as Record<string, string | null | undefined>;
      const categories = searches.map(s => facets(s).category).filter(Boolean);
      const locations = searches.map(s => facets(s).location).filter(Boolean);
      const priceRanges = searches.map(s => facets(s).priceRange).filter(Boolean);

      return {
        preferredCategories: getTopItems(categories, 3),
        preferredLocations: getTopItems(locations, 3),
        preferredPriceRanges: getTopItems(priceRanges, 2),
        searchCount: searches.length
      };
    } catch (error) {
      handleError(error, { component: 'useSimplePersonalization', action: 'getUserPreferencesFromSearch' });
      return null;
    }
  };

  const getTrendingContent = async (): Promise<ScoredItem[]> => {
    try {
      const timeThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Newest rows first, bounded. This pulled every row in the window with no
      // limit and scored them in the browser.
      let query = supabase
        .from('user_analytics')
        .select('content_type, content_id, event_type')
        .gte('created_at', timeThreshold)
        .order('created_at', { ascending: false })
        .limit(ANALYTICS_SCAN_LIMIT);

      if (contentType) {
        query = query.eq('content_type', contentType);
      }

      const { data: analytics, error } = await query;

      // Silently handle permission errors
      if (error) return [];
      if (!analytics) return [];

      const contentScores = new Map<string, ScoredItem>();
      for (const item of analytics) {
        if (!item.content_type || !item.content_id || !isTrendingContentType(item.content_type)) continue;
        const key = `${item.content_type}:${item.content_id}`;
        const entry = contentScores.get(key) ?? { content_type: item.content_type, content_id: item.content_id, score: 0 };
        entry.score += EVENT_WEIGHTS[item.event_type as string] ?? 0;
        contentScores.set(key, entry);
      }

      return [...contentScores.values()].sort((a, b) => b.score - a.score).slice(0, 20);
    } catch (error) {
      handleError(error, { component: 'useSimplePersonalization', action: 'getTrendingContent' });
      return [];
    }
  };

  const combineAndScoreRecommendations = async (
    preferences: SearchPreferences | null,
    trending: ScoredItem[],
  ): Promise<SimpleRecommendation[]> => {
    const recommendations: SimpleRecommendation[] = [];
    const seenContentIds = new Set<string>();

    // Candidate trending items (dedup, preserve order/score).
    const candidates: ScoredItem[] = [];
    for (const item of trending.slice(0, limit * 2)) {
      if (seenContentIds.has(item.content_id)) continue;
      seenContentIds.add(item.content_id);
      candidates.push(item);
    }

    // One visible-rows read per type. Rows that are past, hidden, merged or
    // inactive come back absent and drop out below, where they used to be
    // fetched with select('*') and shown as "trending".
    const idsByType = new Map<TrendingContentType, string[]>();
    for (const item of candidates) {
      idsByType.set(item.content_type, [...(idsByType.get(item.content_type) ?? []), item.content_id]);
    }
    const contentById = new Map<string, Record<string, unknown>>();
    await Promise.all(
      [...idsByType.entries()].map(async ([type, ids]) => {
        try {
          for (const [key, row] of await fetchVisibleContent(type, ids)) contentById.set(key, row);
        } catch (error) {
          handleError(error, { component: 'useSimplePersonalization', action: 'fetchVisibleContent' });
        }
      }),
    );

    // Rebuild in the original trending order with the preference boost.
    for (const item of candidates) {
      const content = contentById.get(`${item.content_type}:${item.content_id}`);
      if (!content) continue;

      let score = item.score;
      let reason = 'Popular right now';
      if (preferences && preferences.preferredCategories.includes(item.content_type)) {
        score *= 1.5;
        reason = 'Matches your interests';
      }

      recommendations.push({
        id: `rec-${item.content_id}`,
        contentType: item.content_type,
        content,
        score,
        reason,
      });
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
    const types: TrendingContentType[] = contentType ? [contentType] : ['event', 'restaurant', 'attraction', 'playground'];

    // Parallel reads, then filled in type-priority order. Same visibility rules
    // as the trending path: this fallback used select('*') ordered by
    // created_at with no filter, so a long-past event could lead the list.
    const perType = await Promise.all(
      types.map(async (type) => {
        try {
          return { type, rows: await fetchRecentVisibleContent(type, needed) };
        } catch (error) {
          handleError(error, { component: 'useSimplePersonalization', action: 'getPopularContent' });
          return { type, rows: [] as Array<Record<string, unknown>> };
        }
      }),
    );

    for (const { type, rows } of perType) {
      for (const item of rows) {
        if (popular.length >= needed) break;
        if (excludeIds.has(item.id as string)) continue;
        popular.push({
          id: `pop-${item.id as string}`,
          contentType: type,
          content: item,
          score: 10, // Base score for popular content
          reason: 'Recently added',
        });
      }
    }

    return popular;
  };

  const getFallbackRecommendations = async (): Promise<SimpleRecommendation[]> => {
    return getPopularContent(limit, new Set());
  };

  const trackRecommendationClick = async (recommendation: SimpleRecommendation) => {
    try {
      const { error } = await supabase.from('user_analytics').insert({
        session_id: sessionId,
        user_id: user?.id,
        event_type: 'click',
        content_type: recommendation.contentType,
        content_id: recommendation.content.id as string,
        device_type: getMobileDetect(),
        user_agent: navigator.userAgent,
        page_url: window.location.href
      });

      // Silently handle permission errors - analytics are optional
      if (error) return;
    } catch (error) {
      // handleError logs without throwing, so analytics failures still never affect the user experience.
      handleError(error, { component: 'useSimplePersonalization', action: 'trackRecommendationClick' });
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
