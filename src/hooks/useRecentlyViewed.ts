import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { Event } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { createEventSlugWithCentralTime } from '@/lib/timezone';
import { createLogger } from '@/lib/logger';
import {
  RecentlyViewedEntry,
  RecentlyViewedType,
  RECENTLY_VIEWED_CAP,
  clearRecentlyViewed as clearStore,
  getRecentlyViewedSnapshot,
  mergeServerEntries,
  recordView as recordViewStore,
  removeRecentlyViewed as removeStore,
  subscribeRecentlyViewed,
} from '@/lib/recentlyViewed';

const log = createLogger('useRecentlyViewed');

// Module-level guard so the (potentially many) hook consumers run the
// sign-in server merge exactly once per user, not once per mounted component.
let syncedUserId: string | null = null;

/** Map an Event into a recently-viewed entry (path precomputed so links resolve). */
export function eventToRecentEntry(event: Event): Omit<RecentlyViewedEntry, 'viewedAt'> {
  return {
    id: event.id,
    type: 'event',
    title: event.title,
    image_url: event.image_url,
    subtitle: event.category,
    date: event.date,
    path: `/events/${createEventSlugWithCentralTime(event.title, event)}`,
  };
}

function entryToServerRow(entry: RecentlyViewedEntry, userId: string) {
  return {
    user_id: userId,
    content_id: entry.id,
    content_type: entry.type,
    title: entry.title ?? null,
    image_url: entry.image_url ?? null,
    subtitle: entry.subtitle ?? null,
    path: entry.path ?? null,
    event_date: entry.date ?? null,
    viewed_at: new Date(entry.viewedAt).toISOString(),
  };
}

interface ServerRow {
  content_id: string;
  content_type: RecentlyViewedType;
  title: string | null;
  image_url: string | null;
  subtitle: string | null;
  path: string | null;
  event_date: string | null;
  viewed_at: string;
}

function serverRowToEntry(row: ServerRow): RecentlyViewedEntry | null {
  if (!row.content_id || !row.content_type || !row.path) return null;
  return {
    id: row.content_id,
    type: row.content_type,
    title: row.title ?? '',
    image_url: row.image_url ?? undefined,
    subtitle: row.subtitle ?? undefined,
    date: row.event_date ?? undefined,
    path: row.path,
    viewedAt: new Date(row.viewed_at).getTime(),
  };
}

// Best-effort server upsert; never throws (tracking must not block the UI).
async function upsertServer(entry: RecentlyViewedEntry, userId: string): Promise<void> {
  try {
    await (supabase.from('recently_viewed' as never) as never as {
      upsert: (v: unknown, o: unknown) => Promise<{ error: unknown }>;
    }).upsert(entryToServerRow(entry, userId), {
      onConflict: 'user_id,content_id,content_type',
    });
  } catch (error) {
    log.warn('upsertServer', 'failed to persist view', { error: String(error) });
  }
}

/**
 * Unified recently-viewed hook (WEB-FEAT-007). Backed by the external store
 * (@/lib/recentlyViewed) so the rail, dashboard and detail pages stay in sync;
 * for signed-in users it write-throughs to the `recently_viewed` server table
 * and merges that cross-device history in on sign-in.
 */
export function useRecentlyViewed() {
  const { isAuthenticated, user } = useAuth();
  const recentlyViewed = useSyncExternalStore(
    subscribeRecentlyViewed,
    getRecentlyViewedSnapshot,
    getRecentlyViewedSnapshot,
  );

  // On sign-in, push local history up and merge the server copy back down
  // (cross-device continuity + guest→account carryover). Once per user.
  useEffect(() => {
    if (!isAuthenticated || !user) {
      syncedUserId = null;
      return;
    }
    if (syncedUserId === user.id) return;
    syncedUserId = user.id;

    let active = true;
    (async () => {
      try {
        const local = getRecentlyViewedSnapshot();
        if (local.length > 0) {
          await (supabase.from('recently_viewed' as never) as never as {
            upsert: (v: unknown, o: unknown) => Promise<{ error: unknown }>;
          }).upsert(
            local.map((e) => entryToServerRow(e, user.id)),
            { onConflict: 'user_id,content_id,content_type' },
          );
        }
        const { data } = await (supabase
          .from('recently_viewed' as never)
          .select('content_id,content_type,title,image_url,subtitle,path,event_date,viewed_at')
          .order('viewed_at', { ascending: false })
          .limit(RECENTLY_VIEWED_CAP) as never as Promise<{ data: ServerRow[] | null }>);
        if (active && data) {
          const entries = data.map(serverRowToEntry).filter(Boolean) as RecentlyViewedEntry[];
          mergeServerEntries(entries);
        }
      } catch (error) {
        // Reset the guard so a later session retries the merge.
        syncedUserId = null;
        log.warn('syncOnSignIn', 'recently-viewed sync failed', { error: String(error) });
      }
    })();

    return () => {
      active = false;
    };
  }, [isAuthenticated, user]);

  const recordView = useCallback(
    (entry: Omit<RecentlyViewedEntry, 'viewedAt'>) => {
      recordViewStore(entry);
      if (isAuthenticated && user) {
        void upsertServer({ ...entry, viewedAt: Date.now() }, user.id);
      }
    },
    [isAuthenticated, user],
  );

  // Back-compat: existing event call sites pass a full Event object.
  const addToRecentlyViewed = useCallback(
    (event: Event) => {
      try {
        recordView(eventToRecentEntry(event));
      } catch (error) {
        log.error('addToRecentlyViewed', 'Failed to add to recently viewed', {
          error: String(error),
        });
      }
    },
    [recordView],
  );

  const removeFromRecentlyViewed = useCallback(
    (id: string, type?: RecentlyViewedType) => {
      removeStore(id, type);
      if (isAuthenticated && user) {
        let q = supabase
          .from('recently_viewed' as never)
          .delete()
          .eq('content_id' as never, id as never);
        if (type) q = q.eq('content_type' as never, type as never);
        void (q as never as Promise<unknown>);
      }
    },
    [isAuthenticated, user],
  );

  const clearRecentlyViewed = useCallback(() => {
    clearStore();
    if (isAuthenticated && user) {
      void (supabase
        .from('recently_viewed' as never)
        .delete()
        .eq('user_id' as never, user.id as never) as never as Promise<unknown>);
    }
  }, [isAuthenticated, user]);

  return {
    recentlyViewed,
    recordView,
    addToRecentlyViewed,
    clearRecentlyViewed,
    removeFromRecentlyViewed,
  };
}
