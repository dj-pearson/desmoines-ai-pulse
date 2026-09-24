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

/**
 * Restaurant detail pages live at /restaurants/:slug. The id still resolves
 * (RestaurantDetails falls back to it), but it is not the canonical URL, so
 * look the slugs up in one query. A failure here costs a prettier link, not
 * the feed, so it degrades to the id instead of failing the page.
 */
async function attachRestaurantSlugs(rows: SceneUpdate[]): Promise<SceneUpdate[]> {
  const ids = [
    ...new Set(
      rows
        .filter((r) => r.entity_type === 'restaurant' && r.entity_id)
        .map((r) => r.entity_id as string),
    ),
  ];
  if (ids.length === 0) return rows;

  const { data, error } = await supabase.from('restaurants').select('id, slug').in('id', ids);
  if (error) {
    log.warn('attachRestaurantSlugs', 'Restaurant slug lookup failed; linking by id', {
      error: error.message,
    });
    return rows;
  }
  const slugById = new Map<string, string>();
  for (const r of (data ?? []) as Array<{ id: string; slug: string | null }>) {
    if (r.slug) slugById.set(r.id, r.slug);
  }
  return rows.map((r) =>
    r.entity_type === 'restaurant' && r.entity_id
      ? { ...r, entity_slug: slugById.get(r.entity_id) ?? null }
      : r,
  );
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
      return { rows: await attachRestaurantSlugs(visible), next };
    },
    getNextPageParam: (lastPage) => lastPage.next,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * How many published rows each update_type has, from one query.
 *
 * Four of the six chips used to be types nothing in the repo ever writes, so
 * they could only ever lead to an empty list (WP6 item 1). The page renders a
 * chip only for a type with rows. The table is small and one column wide;
 * the cap keeps a runaway ingest from turning this into a large download.
 */
export function useSceneUpdateTypeCounts() {
  return useQuery({
    queryKey: ['scene-updates', 'type-counts'],
    queryFn: async (): Promise<{ counts: Partial<Record<SceneUpdateType, number>>; latest: string | null }> => {
      const nowMs = Date.now();
      const { data, error } = await supabase
        .from('scene_updates')
        .select('update_type, publish_date')
        .eq('is_published', true)
        .lte('publish_date', new Date(nowMs).toISOString())
        .order('publish_date', { ascending: false })
        .limit(2000);

      if (error) {
        log.warn('useSceneUpdateTypeCounts', 'Failed to count scene updates', { error: error.message });
        throw error;
      }

      const counts: Partial<Record<SceneUpdateType, number>> = {};
      let latest: string | null = null;
      for (const row of (data ?? []) as Array<{ update_type: string; publish_date: string | null }>) {
        if (!isPublishedBy(row, nowMs) || !isSceneUpdateType(row.update_type)) continue;
        counts[row.update_type] = (counts[row.update_type] ?? 0) + 1;
        if (!latest) latest = row.publish_date;
      }
      return { counts, latest };
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
