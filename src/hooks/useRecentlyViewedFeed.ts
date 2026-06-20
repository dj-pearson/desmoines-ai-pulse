import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  readRecentlyViewed,
  recordView,
  removeView,
  clearRecentlyViewed,
  normalizeEntries,
  type RecentlyViewedEntry,
  type RecentlyViewedType,
} from "@/lib/recentlyViewed";

/**
 * Unified recently-viewed feed (WEB-FEAT-007).
 *
 * Local safeStorage is the source of truth; signed-in users additionally sync
 * to the `recently_viewed` table so items follow them across devices. Server
 * calls are best-effort: any failure (incl. the table not being deployed yet)
 * is swallowed so the guest experience never breaks.
 */
type ViewInput = Omit<RecentlyViewedEntry, "viewedAt">;

function toEntry(row: {
  content_id: string;
  content_type: string;
  title: string;
  href: string;
  image_url?: string | null;
  subtitle?: string | null;
  viewed_at: string;
}): RecentlyViewedEntry {
  return {
    id: row.content_id,
    type: row.content_type as RecentlyViewedType,
    title: row.title,
    href: row.href,
    image_url: row.image_url ?? undefined,
    subtitle: row.subtitle ?? undefined,
    viewedAt: new Date(row.viewed_at).getTime(),
  };
}

/** Read + manage the recently-viewed feed (for the home rail and dashboard). */
export function useRecentlyViewedFeed() {
  const { user, isAuthenticated } = useAuth();
  const [entries, setEntries] = useState<RecentlyViewedEntry[]>(() => readRecentlyViewed());

  // Merge server rows for signed-in users (server + local union, newest wins).
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("recently_viewed" as never)
          .select("content_id, content_type, title, href, image_url, subtitle, viewed_at")
          .order("viewed_at", { ascending: false });
        if (error || cancelled || !data) return;
        const serverEntries = (data as unknown as Parameters<typeof toEntry>[0][]).map(toEntry);
        setEntries((local) => {
          const byKey = new Map<string, RecentlyViewedEntry>();
          for (const e of [...serverEntries, ...local]) {
            const key = `${e.type}:${e.id}`;
            const existing = byKey.get(key);
            if (!existing || e.viewedAt > existing.viewedAt) byKey.set(key, e);
          }
          return normalizeEntries([...byKey.values()]);
        });
      } catch {
        // best-effort; guest store already populated state
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id]);

  const remove = useCallback(
    (id: string, type: RecentlyViewedType) => {
      setEntries(removeView(id, type));
      if (isAuthenticated && user?.id) {
        void supabase
          .from("recently_viewed" as never)
          .delete()
          .match({ user_id: user.id, content_type: type, content_id: id })
          .then(undefined, () => undefined);
      }
    },
    [isAuthenticated, user?.id],
  );

  const clear = useCallback(() => {
    clearRecentlyViewed();
    setEntries([]);
  }, []);

  return { entries, remove, clear };
}

/**
 * Record a view on a detail page. Pass the entry once the item has loaded;
 * `null` while loading is a no-op. Records once per (type,id) per mount.
 */
export function useRecordRecentView(input: ViewInput | null) {
  const { user, isAuthenticated } = useAuth();
  const key = input ? `${input.type}:${input.id}` : null;

  useEffect(() => {
    if (!input || !key) return;
    recordView(input);
    if (isAuthenticated && user?.id) {
      void supabase
        .from("recently_viewed" as never)
        .upsert(
          {
            user_id: user.id,
            content_type: input.type,
            content_id: input.id,
            title: input.title,
            href: input.href,
            image_url: input.image_url ?? null,
            subtitle: input.subtitle ?? null,
            viewed_at: new Date().toISOString(),
          } as never,
          { onConflict: "user_id,content_type,content_id" },
        )
        .then(undefined, () => undefined);
    }
    // Record once per item per mount; deeper fields don't need to re-trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, isAuthenticated, user?.id]);
}
