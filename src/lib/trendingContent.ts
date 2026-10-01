import { supabase } from '@/integrations/supabase/client';
import { applyEventVisibility } from '@/lib/eventQuery';
import {
  ATTRACTION_LIST_COLUMNS,
  EVENT_LIST_COLUMNS,
  PLAYGROUND_LIST_COLUMNS,
  RESTAURANT_LIST_COLUMNS,
} from '@/lib/listColumns';
import { createSlug } from '@/lib/slug';
import { createEventSlugWithCentralTime } from '@/lib/timezone';

/**
 * Shared reads for the Social "Trending" tab (TrendingContent, fed by
 * useTrending in useTrendingContent.ts and by useSimplePersonalization).
 *
 * Both hooks fetched content rows with select('*') and no visibility filter,
 * so a past, hidden, merged or archived event could appear under "Trending
 * Events"; both scanned every user_analytics row in the window with no limit;
 * and TrendingContent navigated to /<type>/<uuid>, which is a 404 for
 * attractions and playgrounds (they resolve by slug or name, never by id).
 */

export type TrendingContentType = 'event' | 'restaurant' | 'attraction' | 'playground';

/** Newest analytics rows scored per window. Enough to rank; bounded either way. */
export const ANALYTICS_SCAN_LIMIT = 2000;

const TABLES: Record<TrendingContentType, 'events' | 'restaurants' | 'attractions' | 'playgrounds'> = {
  event: 'events',
  restaurant: 'restaurants',
  attraction: 'attractions',
  playground: 'playgrounds',
};

const COLUMNS: Record<TrendingContentType, string> = {
  event: EVENT_LIST_COLUMNS,
  restaurant: RESTAURANT_LIST_COLUMNS,
  attraction: ATTRACTION_LIST_COLUMNS,
  playground: PLAYGROUND_LIST_COLUMNS,
};

export function isTrendingContentType(value: string): value is TrendingContentType {
  return value in TABLES;
}

export function tableForContentType(type: TrendingContentType) {
  return TABLES[type];
}

/** Start of today, so an event later today still counts as upcoming. */
function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * The public-visibility filters each list page applies, for one table.
 * Loosely typed on purpose: the four tables have four builder types and
 * applyEventVisibility documents why asking tsc to unify them goes badly.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyPublicVisibility(type: TrendingContentType, query: any): any {
  switch (type) {
    case 'event':
      return applyEventVisibility(query).gte('date', startOfTodayIso());
    case 'restaurant':
      return query.neq('is_merged', true);
    case 'attraction':
      return query.eq('is_active', true);
    default:
      return query;
  }
}

/** Visible rows for these ids, keyed `${type}:${id}`. Hidden rows are simply absent. */
export async function fetchVisibleContent(
  type: TrendingContentType,
  ids: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  if (ids.length === 0) return out;
  const query = supabase.from(TABLES[type]).select(COLUMNS[type]).in('id', ids);
  const { data, error } = await applyPublicVisibility(type, query);
  if (error) throw error;
  for (const row of (data ?? []) as Array<Record<string, unknown>>) out.set(`${type}:${row.id as string}`, row);
  return out;
}

/** Newest visible rows of one type, for the "recently added" fill-in. */
export async function fetchRecentVisibleContent(
  type: TrendingContentType,
  limit: number,
): Promise<Array<Record<string, unknown>>> {
  const query = supabase.from(TABLES[type]).select(COLUMNS[type]).order('created_at', { ascending: false }).limit(limit);
  const { data, error } = await applyPublicVisibility(type, query);
  if (error) throw error;
  return (data ?? []) as Array<Record<string, unknown>>;
}

/** The canonical detail URL, built the way each list page builds it. */
export function contentHref(type: TrendingContentType, row: Record<string, unknown> | null, id: string): string {
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  switch (type) {
    case 'event':
      return row ? `/events/${createEventSlugWithCentralTime(str(row.title) ?? null, row)}` : `/events/${id}`;
    case 'restaurant':
      return `/restaurants/${str(row?.slug) ?? id}`;
    case 'attraction':
      return row && str(row.name) ? `/attractions/${createSlug(row.name as string)}` : '/attractions';
    case 'playground':
      return row && str(row.name) ? `/playgrounds/${createSlug(row.name as string)}` : '/playgrounds';
  }
}
