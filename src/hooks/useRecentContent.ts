import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { analyticsGranted } from '@/lib/analyticsConsent';
import { handleError } from '@/lib/errorHandler';
import { fetchRecentVisibleContent, type TrendingContentType } from '@/lib/trendingContent';

/**
 * The most recently added visible rows, used to fill the Social "Trending"
 * grids when there is not enough trending data.
 *
 * This replaced useSimplePersonalization, whose output TrendingContent badged
 * "For You". Its two personal signals were reads of search_analytics and
 * user_analytics, and both have an admin-only SELECT policy, so for every
 * other visitor RLS answered [] and every "For You" card was a recently added
 * row. Even for an admin the boost compared a search category with a content
 * type and could not match. Nothing the browser can read says what a visitor
 * likes, so this hook claims nothing: it returns recent rows, and the card
 * says "Recently added".
 */

export interface RecentContentItem {
  id: string;
  contentType: TrendingContentType;
  content: Record<string, unknown>;
}

interface RecentContentOptions {
  contentType?: TrendingContentType;
  limit?: number;
  enabled?: boolean;
}

/** Fill order when no type is given. */
const ALL_TYPES: TrendingContentType[] = ['event', 'restaurant', 'attraction', 'playground'];

async function fetchRecentContent(
  contentType: TrendingContentType | undefined,
  limit: number,
): Promise<RecentContentItem[]> {
  const types = contentType ? [contentType] : ALL_TYPES;

  // Parallel reads, then filled in type order. A failed type is reported and
  // skipped, so one table's outage does not empty the whole grid.
  const perType = await Promise.all(
    types.map(async (type) => {
      try {
        return { type, rows: await fetchRecentVisibleContent(type, limit) };
      } catch (error) {
        handleError(error, { component: 'useRecentContent', action: 'fetchRecentContent' });
        return { type, rows: [] as Array<Record<string, unknown>> };
      }
    }),
  );

  const items: RecentContentItem[] = [];
  for (const { type, rows } of perType) {
    for (const row of rows) {
      if (items.length >= limit) return items;
      if (typeof row.id !== 'string') continue;
      items.push({ id: `recent-${type}-${row.id}`, contentType: type, content: row });
    }
  }
  return items;
}

export function useRecentContent(options: RecentContentOptions = {}) {
  const { contentType, limit = 5, enabled = true } = options;
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['recent-content', { contentType: contentType ?? null, limit }],
    queryFn: () => fetchRecentContent(contentType, limit),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  /**
   * A click on a fill card, recorded as analytics. Only with analytics
   * consent: the row carries the user id, user agent and page URL, and the old
   * hook wrote it for every visitor.
   */
  const trackClick = async (item: RecentContentItem) => {
    if (!analyticsGranted()) return;
    try {
      const { error } = await supabase.from('user_analytics').insert({
        session_id: getSessionId(),
        user_id: user?.id,
        event_type: 'click',
        content_type: item.contentType,
        content_id: item.content.id as string,
        device_type: getDeviceType(),
        user_agent: navigator.userAgent,
        page_url: window.location.href,
      });
      // Analytics are optional; a rejected insert never reaches the reader.
      if (error) return;
    } catch (error) {
      handleError(error, { component: 'useRecentContent', action: 'trackClick' });
    }
  };

  return {
    items: query.data ?? [],
    isLoading: enabled && query.isLoading,
    trackClick,
  };
}

let sessionId: string | null = null;
function getSessionId(): string {
  sessionId ??= crypto.randomUUID();
  return sessionId;
}

function getDeviceType(): string {
  const userAgent = navigator.userAgent;
  if (/tablet|ipad|playbook|silk/i.test(userAgent)) return 'tablet';
  if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(userAgent)) return 'mobile';
  return 'desktop';
}
