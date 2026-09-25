import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';
import { DES_MOINES_TIME_ZONE } from '@/lib/restaurantHours';

const log = createLogger('useSceneUpdates');

export type SceneUpdateType = 'new_opening' | 'closing' | 'renovation' | 'expansion' | 'news';

/** Every value the feed knows how to label, in chip order. */
export const SCENE_UPDATE_TYPES: ReadonlyArray<{ value: SceneUpdateType; label: string }> = [
  { value: 'new_opening', label: 'New openings' },
  { value: 'closing', label: 'Closings' },
  { value: 'renovation', label: 'Renovations' },
  { value: 'expansion', label: 'Expansions' },
  { value: 'news', label: 'News' },
];

export function isSceneUpdateType(value: string | null | undefined): value is SceneUpdateType {
  return SCENE_UPDATE_TYPES.some((t) => t.value === value);
}

/**
 * The columns the card renders, and nothing else. This was select('*'),
 * which also shipped author, is_published and created_at to a page that
 * shows none of them (plan-stay WP6 item 7).
 */
const SCENE_UPDATE_COLUMNS =
  'id, title, body, update_type, entity_type, entity_id, image_url, source_url, neighborhood, publish_date';

export interface SceneUpdate {
  id: string;
  title: string;
  body: string;
  update_type: SceneUpdateType;
  entity_type: string | null;
  entity_id: string | null;
  image_url: string | null;
  source_url: string | null;
  neighborhood: string | null;
  publish_date: string;
  /** The restaurant's slug when entity_type is 'restaurant' and one exists. */
  entity_slug?: string | null;
  /**
   * For a restaurant update: whether the restaurant row still stands on its
   * own. `missing` (not returned, or the lookup failed), `merged` (folded into
   * another row) and `closed` (status says so) come from the slug lookup.
   */
  entity_state?: 'ok' | 'missing' | 'merged' | 'closed';
}

/**
 * The in-app page a scene update points at, or null when there is none worth
 * linking (pass 2 WP4 items 7 and 13). A restaurant links only by slug and
 * only when its row came back and is not merged: an id link to a row that is
 * gone rendered "Restaurant not found" at a /restaurants/<uuid> URL.
 */
export function sceneUpdateHref(update: SceneUpdate): string | null {
  if (!update.entity_id || !update.entity_type) return null;
  if (update.entity_type === 'restaurant') {
    if (update.entity_state === 'missing' || update.entity_state === 'merged') return null;
    return update.entity_slug ? `/restaurants/${update.entity_slug}` : null;
  }
  if (update.entity_type === 'attraction') {
    return `/attractions/${update.entity_id}`;
  }
  return null;
}

export const SCENE_UPDATES_PAGE_SIZE = 20;

interface SceneUpdateCursor {
  publish_date: string;
  id: string;
}

interface SceneUpdatePage {
  rows: SceneUpdate[];
  next: SceneUpdateCursor | null;
}

/** A publish_date that is set and not in the future. */
function isPublishedBy(row: { publish_date: string | null }, nowMs: number): boolean {
  if (!row.publish_date) return false;
  const t = new Date(row.publish_date).getTime();
  return Number.isFinite(t) && t <= nowMs;
}

/** The restaurants.status value that means the place is not operating (the column's CHECK allows one). */
const CLOSED_RESTAURANT_STATUSES = new Set(['closed']);

interface RestaurantLookupRow {
  id: string;
  slug: string | null;
  status: string | null;
  is_merged: boolean | null;
}

/**
 * Restaurant detail pages live at /restaurants/:slug, so look the rows up in
 * one query: slug for the link, status for "Now closed", is_merged so a
 * merged duplicate is not linked. A failed lookup costs the links, not the
 * feed: every restaurant row is treated as missing and renders unlinked,
 * rather than as an id URL that may not resolve.
 */
async function attachRestaurantState(rows: SceneUpdate[]): Promise<SceneUpdate[]> {
  const ids = [
    ...new Set(
      rows
        .filter((r) => r.entity_type === 'restaurant' && r.entity_id)
        .map((r) => r.entity_id as string),
    ),
  ];
  if (ids.length === 0) return rows;

  const { data, error } = await supabase
    .from('restaurants')
    .select('id, slug, status, is_merged')
    .in('id', ids);
  if (error) {
    log.warn('attachRestaurantState', 'Restaurant lookup failed; rendering restaurant updates unlinked', {
      error: error.message,
    });
  }
  const byId = new Map<string, RestaurantLookupRow>();
  for (const r of (error ? [] : data ?? []) as RestaurantLookupRow[]) byId.set(r.id, r);

  return rows.map((r) => {
    if (r.entity_type !== 'restaurant' || !r.entity_id) return r;
    const found = byId.get(r.entity_id);
    if (!found) return { ...r, entity_slug: null, entity_state: 'missing' as const };
    const state = found.is_merged
      ? ('merged' as const)
      : CLOSED_RESTAURANT_STATUSES.has((found.status ?? '').trim().toLowerCase())
        ? ('closed' as const)
        : ('ok' as const);
    return { ...r, entity_slug: found.slug, entity_state: state };
  });
}

/**
 * The What's New feed, newest first, a page at a time.
 *
 * Keyset pagination on (publish_date, id) rather than offset, so a row
 * published while someone reads does not shift the next page by one.
 *
 * publish_date <= now on the server keeps scheduled rows out; the same check
 * runs again on the client so a clock-skewed or unfiltered response still
 * cannot show a future row as "Just now" (WP6 item 3).
 */
export function useSceneUpdates(filters?: { type?: SceneUpdateType }) {
  const type = filters?.type;
  return useInfiniteQuery({
    queryKey: ['scene-updates', { type: type ?? null }],
    initialPageParam: null as SceneUpdateCursor | null,
    queryFn: async ({ pageParam }): Promise<SceneUpdatePage> => {
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      let query = supabase
        .from('scene_updates')
        .select(SCENE_UPDATE_COLUMNS)
        .eq('is_published', true)
        .lte('publish_date', nowIso)
        .order('publish_date', { ascending: false })
        .order('id', { ascending: false })
        .limit(SCENE_UPDATES_PAGE_SIZE);

      if (type) {
        query = query.eq('update_type', type);
      }
      if (pageParam) {
        const d = pageParam.publish_date;
        query = query.or(
          `publish_date.lt."${d}",and(publish_date.eq."${d}",id.lt.${pageParam.id})`,
        );
      }

      const { data, error } = await query;

      // WEB-QA-031: this used to log a warning and return [], which is the
      // false-empty-state defect one level down from the page. TanStack never
      // saw a failure, so it never retried and never set isError - and
      // /whats-new rendered "No updates yet", a confident answer to a question
      // the page could not answer. Throwing restores both the retries and the
      // error the page needs to tell the two apart.
      if (error) {
        log.warn('useSceneUpdates', 'Failed to fetch scene updates', { error: error.message });
        throw error;
      }

      const raw = (data ?? []) as unknown as Array<SceneUpdate & { publish_date: string | null }>;
      const last = raw[raw.length - 1];
      const next =
        raw.length === SCENE_UPDATES_PAGE_SIZE && last?.publish_date
          ? { publish_date: last.publish_date, id: last.id }
          : null;

      const visible = raw.filter((r) => isPublishedBy(r, nowMs)) as SceneUpdate[];
      return { rows: await attachRestaurantState(visible), next };
    },
    getNextPageParam: (lastPage) => lastPage.next,
    staleTime: 2 * 60 * 1000,
  });
}

export interface SceneUpdateTypeCounts {
  counts: Partial<Record<SceneUpdateType, number>>;
  latest: string | null;
}

/**
 * How many published rows each update_type has, and the newest publish date.
 *
 * One count-only HEAD request per known type plus one single-row read for the
 * date, in parallel (pass 2 WP4 item 8). This used to download up to 2,000
 * rows to count them in the browser. Any failure rejects the whole query, and
 * the page then shows every chip rather than none.
 */
export function useSceneUpdateTypeCounts() {
  return useQuery({
    queryKey: ['scene-updates', 'type-counts'],
    queryFn: async (): Promise<SceneUpdateTypeCounts> => {
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      const countFor = async (type: SceneUpdateType): Promise<[SceneUpdateType, number]> => {
        const { count, error } = await supabase
          .from('scene_updates')
          .select('id', { count: 'exact', head: true })
          .eq('is_published', true)
          .lte('publish_date', nowIso)
          .eq('update_type', type);
        if (error) throw error;
        return [type, count ?? 0];
      };

      const latestRow = async (): Promise<string | null> => {
        const { data, error } = await supabase
          .from('scene_updates')
          .select('publish_date')
          .eq('is_published', true)
          .lte('publish_date', nowIso)
          .order('publish_date', { ascending: false })
          .limit(1);
        if (error) throw error;
        const row = ((data ?? []) as Array<{ publish_date: string | null }>)[0];
        return row && isPublishedBy(row, nowMs) ? row.publish_date : null;
      };

      try {
        const [pairs, latest] = await Promise.all([
          Promise.all(SCENE_UPDATE_TYPES.map((t) => countFor(t.value))),
          latestRow(),
        ]);
        const counts: Partial<Record<SceneUpdateType, number>> = {};
        for (const [type, n] of pairs) counts[type] = n;
        return { counts, latest };
      } catch (error) {
        log.warn('useSceneUpdateTypeCounts', 'Failed to count scene updates', {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    staleTime: 2 * 60 * 1000,
  });
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * "Just now", "5h ago", "3d ago" inside a week; after that the absolute date
 * in Central time, because "6w ago" makes the reader do arithmetic and a
 * browser in another zone could land a late-evening post on the wrong day.
 */
export function formatSceneUpdateTime(iso: string, nowMs: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Math.max(0, nowMs - t);
  const hours = Math.floor(diff / HOUR_MS);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const sameYear =
    formatInTimeZone(t, DES_MOINES_TIME_ZONE, 'yyyy') ===
    formatInTimeZone(nowMs, DES_MOINES_TIME_ZONE, 'yyyy');
  return formatInTimeZone(t, DES_MOINES_TIME_ZONE, sameYear ? 'MMM d' : 'MMM d, yyyy');
}
