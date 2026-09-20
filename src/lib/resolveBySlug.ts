import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { isUnknownColumnError } from "@/lib/postgrestErrors";
import { createSlug } from "@/lib/slug";

/**
 * Resolve one content row from a URL slug, by the slug column when the database
 * has it and by a name scan when it does not yet (WEB-PERF-031).
 *
 * THE SHAPE THIS REPLACES. `playgrounds` and `attractions` had no slug column,
 * so three call sites downloaded candidate rows and ran createSlug over them:
 * PlaygroundDetails pulled every playground with select('*'), and
 * usePrefetchAttraction pulled every attraction on card HOVER. Migration
 * 20260919000008 adds the column, a backfill and a trigger.
 *
 * WHY THE FALLBACK EXISTS AND WHEN IT GOES. Cloudflare Pages deploys on push to
 * main; migrations are applied by hand afterwards. In that window
 * `.eq('slug', ...)` is 42703 on the whole select, which for a detail page is a
 * 404 on a URL that worked yesterday. So the first attempt is the fast one and
 * the failure is narrowed to "no such column" before falling back - any other
 * error is rethrown, because turning a real failure into a slow success is how
 * a broken table reads as an empty page. Delete `fetchBySlug`'s fallback branch
 * in the release after the migration is live.
 */
export async function fetchBySlug<T>(
  table: "playgrounds" | "attractions",
  slug: string,
  columns = "*",
): Promise<T | null> {
  // THE `slug` COLUMN IS AHEAD OF THE GENERATED TYPES, deliberately and
  // temporarily. Migration 20260919000008_content_slugs.sql adds it to both
  // tables; regenerating src/integrations/supabase/types.ts needs Supabase
  // credentials the repo does not carry (WEB-PERF-031 AC5), so the types still
  // describe the pre-migration shape and supabase-js 2.85+ - the first version
  // that actually checks the column name at .eq() - rejects it.
  //
  // The assumption is written out rather than hidden behind `as never`: this
  // says "the builder accepts an eq on a string column named slug", which is
  // exactly what the migration makes true. Regenerate the types and this whole
  // block goes, together with the fallback below.
  type SlugQueryable = {
    eq(
      column: "slug",
      value: string,
    ): { maybeSingle(): Promise<{ data: unknown; error: PostgrestError | null }> };
  };
  const bySlug = await (supabase.from(table).select(columns) as unknown as SlugQueryable)
    .eq("slug", slug)
    .maybeSingle();

  if (!bySlug.error) return (bySlug.data as T) ?? null;
  if (!isUnknownColumnError(bySlug.error)) throw bySlug.error;

  // Pre-migration path. Scan (id, name) rather than whole rows: the match is
  // decided by the name alone, and one extra request for the winner is cheaper
  // than every column of every loser.
  const index = await supabase.from(table).select("id, name");
  if (index.error) throw index.error;

  const match = (index.data ?? []).find(
    (row: { name: string | null }) => createSlug(row.name ?? "") === slug,
  );
  if (!match) return null;

  const row = await supabase
    .from(table)
    .select(columns)
    .eq("id", (match as { id: string }).id)
    .maybeSingle();

  if (row.error) throw row.error;
  return (row.data as T) ?? null;
}
