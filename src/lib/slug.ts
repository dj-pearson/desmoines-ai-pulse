/**
 * URL slug from a display name, for content whose table has no `slug` column.
 *
 * `playgrounds` is the case this exists for: the route is `/playgrounds/:slug`
 * but the table stores only `name`, so PlaygroundDetails resolves a row by
 * matching `createSlug(p.name)` against the param. A link built from the row id
 * therefore does not resolve - it renders the not-found state - which is the
 * trap `src/lib/sitemapGenerator.ts:190` still contains (`slug || id`). That
 * module is imported by nothing, so it ships to no one; the live sitemap comes
 * from scripts/generate-dynamic-sitemaps.ts, which slugifies the name and gets
 * 69 correct URLs.
 *
 * This was a private copy inside PlaygroundDetails.tsx. FavoritesView needs the
 * same function to link to a saved playground, and importing it from a lazily
 * loaded page would pull that page into the favorites chunk - so it moved here
 * rather than being pasted a second time. scripts/generate-dynamic-sitemaps.ts
 * keeps its own copy (:66) because scripts do not share the app's module graph;
 * the two are character-for-character equivalent and must stay that way, or the
 * sitemap advertises URLs the router cannot resolve.
 */
export const createSlug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
