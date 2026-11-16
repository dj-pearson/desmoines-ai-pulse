import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve one playground or attraction from its URL slug (WEB-PERF-031).
 *
 * THE SHAPE THIS REPLACED. `playgrounds` and `attractions` had no slug column,
 * so three call sites downloaded candidate rows and ran createSlug over them:
 * PlaygroundDetails pulled every playground with select('*'), and
 * usePrefetchAttraction pulled every attraction on card HOVER. Migration
 * 20260919000008 added the column, a backfill and a trigger that keeps it in
 * step on rename.
 *
 * NO NAME-SCAN FALLBACK ANY MORE. Until the migration was live this fell back
 * to an (id, name) scan on 42703. The column is live: the 2026-10-01
 * production exports in scripts/content-backups (seo-046 attractions, seo-061
 * playgrounds) carry `slug` on every row. So a slug that matches nothing is a
 * real Not Found, and every error is a real error.
 *
 * A stored slug is not always createSlug(name). Duplicate names were suffixed
 * by the backfill (the second "Riverview Park" is riverview-park-2), so build
 * links from the row's `slug` and use the name only when a row has none.
 */
export async function fetchBySlug<T>(
  table: "playgrounds" | "attractions",
  slug: string,
  columns = "*",
): Promise<T | null> {
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  return (data as T) ?? null;
}
