import { createSlug } from "@/lib/slug";

/**
 * Links to playground and attraction detail pages (WEB-PERF-031).
 *
 * Both tables carry a stored `slug` (migration 20260919000008, live in
 * production). It is usually createSlug(name), but not always: the backfill
 * suffixed duplicate names, so the second "Riverview Park" playground is
 * riverview-park-2. A link rebuilt from the name opens the OTHER park, and a
 * canonical rebuilt from it points search engines there too. So the stored
 * slug wins; the name is the fallback for a projection that did not select it,
 * and the id is the last resort.
 *
 * Its own module, importing only createSlug, so a list page can use it without
 * pulling dashboardItems' date code into its chunk.
 */
export interface SlugLinkRow {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
}

export function contentSlug(row: SlugLinkRow): string {
  return row.slug || (row.name ? createSlug(row.name) : "") || row.id || "";
}

export function attractionHref(row: SlugLinkRow): string {
  return `/attractions/${contentSlug(row)}`;
}

export function playgroundHref(row: SlugLinkRow): string {
  return `/playgrounds/${contentSlug(row)}`;
}
