import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { STALE_TIME, GC_TIME, shouldRetry } from '@/lib/queryConfig';
import { createLogger } from '@/lib/logger';

const logger = createLogger('useSearchInsights');

/**
 * A search people ran, or one we suggest.
 *
 * `count` and `trending` are OPTIONAL BECAUSE THEY ARE ONLY KNOWN FROM REAL
 * DATA. search_analytics SELECT is admin-only, so an anonymous visitor always
 * got the fallback list - and the fallback carried invented counts ("45
 * searches") and `trending: true` flags, which rendered as green arrows. A
 * suggestion has neither; undefined renders as nothing (WP9 of
 * docs/page-plans/home.md).
 */
export interface PopularSearch {
  query: string;
  count?: number;
  category?: string;
  trending?: boolean;
}

export interface SearchInsights {
  popularSearches: PopularSearch[];
  trendingQueries: PopularSearch[];
  categoryBreakdown: Record<string, number>;
  recentSearches: string[];
}

interface SearchInsightsResult {
  insights: SearchInsights;
  hasRealData: boolean;
}

interface SearchAnalyticsRow {
  search_query: string | null;
  search_filters: unknown;
  created_at: string | null;
}

const EMPTY_INSIGHTS: SearchInsights = {
  popularSearches: [],
  trendingQueries: [],
  categoryBreakdown: {},
  recentSearches: [],
};

/**
 * Suggestions shown when there is no measured search data. Query text and a
 * category only: no counts, no trend flags, no "recent searches" nobody ran.
 *
 * Home's MostSearched renders these directly and does not call
 * useSearchInsights (home pass-2 WP3 item 4): search_analytics SELECT is
 * admin-only, so the read was always empty for the public, and for an admin it
 * put other visitors' raw queries on the home page. "Top searches" can come
 * back once get_popular_searches is SECURITY DEFINER with a distinct-session
 * threshold and a PII filter (deferred in docs/page-plans/home-pass2.md).
 */
export const SUGGESTED_SEARCHES: readonly PopularSearch[] = [
  { query: 'farmers market', category: 'Events' },
  { query: 'free activities', category: 'Events' },
  { query: 'live music', category: 'Events' },
  { query: 'brunch', category: 'Restaurants' },
  { query: 'craft beer', category: 'Restaurants' },
  { query: 'playgrounds', category: 'Playgrounds' },
  { query: 'art galleries', category: 'Attractions' },
  { query: 'family activities', category: 'Events' },
];

function fallbackInsights(): SearchInsights {
  return { ...EMPTY_INSIGHTS, popularSearches: [...SUGGESTED_SEARCHES] };
}

/** The category lives inside the search_filters JSON (WEB-QA-012). */
function categoryOf(filters: unknown): string | undefined {
  if (filters && typeof filters === 'object' && 'category' in filters) {
    const value = (filters as { category?: unknown }).category;
    if (typeof value === 'string' && value && value !== 'all') return value;
  }
  return undefined;
}

function processRealSearchData(searchData: SearchAnalyticsRow[]): SearchInsights {
  const queryCount: Record<string, { count: number; category?: string }> = {};
  const trending: Record<string, number> = {};
  const now = Date.now();

  for (const search of searchData) {
    const query = String(search.search_query ?? '').toLowerCase().trim();
    if (query.length < 2) continue;

    if (!queryCount[query]) {
      queryCount[query] = { count: 0, category: categoryOf(search.search_filters) };
    }
    queryCount[query].count++;

    // Simple velocity: searches in the last 24h score higher.
    const ageHours = search.created_at
      ? (now - new Date(search.created_at).getTime()) / (1000 * 60 * 60)
      : Infinity;
    trending[query] = (trending[query] || 0) + Math.max(0, 24 - ageHours) / 24;
  }

  const popularSearches = Object.entries(queryCount)
    .filter(([, data]) => data.count >= 2)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 10)
    .map(([query, data]) => ({
      query,
      count: data.count,
      category: data.category,
      trending: (trending[query] || 0) > 2,
    }));

  const trendingQueries = Object.entries(trending)
    .filter(([query]) => (queryCount[query]?.count ?? 0) >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([query]) => ({
      query,
      count: queryCount[query].count,
      category: queryCount[query].category,
      trending: true,
    }));

  const categoryBreakdown: Record<string, number> = {};
  for (const search of searchData) {
    const category = categoryOf(search.search_filters);
    if (category) categoryBreakdown[category] = (categoryBreakdown[category] || 0) + 1;
  }

  const recentSearches = Array.from(
    new Set(
      searchData
        .slice(0, 50)
        .map((s) => s.search_query)
        .filter((q): q is string => Boolean(q)),
    ),
  ).slice(0, 10);

  return { popularSearches, trendingQueries, categoryBreakdown, recentSearches };
}

async function fetchSearchInsights(): Promise<SearchInsightsResult> {
  try {
    return await readSearchInsights();
  } catch (error) {
    // A network failure should still leave the suggestions on screen.
    logger.warn('fetchSearchInsights', 'search_analytics read threw', { error: String(error) });
    return { insights: fallbackInsights(), hasRealData: false };
  }
}

async function readSearchInsights(): Promise<SearchInsightsResult> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('search_analytics')
    // `query`/`category` are not columns; the text is `search_query` and the
    // facets live inside the `search_filters` JSON (WEB-QA-012).
    .select('search_query, search_filters, created_at')
    .gte('created_at', sevenDaysAgo.toISOString())
    .not('search_query', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    // Expected for everyone but admins (RLS), so a warning, not an error.
    logger.warn('fetchSearchInsights', 'Could not read search_analytics', { error: error.message });
    return { insights: fallbackInsights(), hasRealData: false };
  }

  const rows = (data ?? []) as SearchAnalyticsRow[];
  if (rows.length >= 10) {
    const insights = processRealSearchData(rows);
    if (insights.popularSearches.length > 0) {
      return { insights, hasRealData: true };
    }
  }
  return { insights: fallbackInsights(), hasRealData: false };
}

export function useSearchInsights() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['search-insights'],
    queryFn: fetchSearchInsights,
    staleTime: STALE_TIME.SHORT,
    gcTime: GC_TIME,
    retry: shouldRetry,
  });

  return {
    insights: data?.insights ?? EMPTY_INSIGHTS,
    isLoading,
    hasRealData: data?.hasRealData ?? false,
    refetch,
  };
}
