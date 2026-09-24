/**
 * Explicit column projections for LIST queries (WEB-PERF-001).
 *
 * List cards/filters/sorting never read the heavy SEO/GEO text, the AI-prompt
 * audit fields, the tsvector, or the PostGIS geometry blob — but `select('*')`
 * drags all of them into every card payload over the wire. These lists keep
 * every column the list UI actually uses and drop only the known-heavy,
 * never-rendered ones:
 *   seo_title/seo_description/seo_keywords, geo_summary/geo_key_facts/geo_faq,
 *   search_vector, geom, writeup_prompt_used.
 *
 * Detail pages keep their full-row queries (they render SEO/GEO content).
 *
 * ai_writeup IS NOT IN THESE LISTS (WEB-PERF-035). It is a 250-350 word
 * paragraph per row and NO card renders it - the only readers are
 * ContentTable, which shows a tick for "has a writeup", and
 * AIEnhancementManager, which filters on it being null. So every /events and
 * /restaurants response was carrying roughly 2 KB per row to draw a checkmark
 * on a page the public never opens. The two admin surfaces ask for it
 * explicitly via ADMIN_EXTRA_COLUMNS below.
 */

/**
 * Columns only the admin tables need, appended to a list projection when the
 * caller asks. Kept here rather than spelled out at the call site so that
 * "what is heavy and why" stays in one file.
 */
export const ADMIN_EXTRA_COLUMNS = "ai_writeup";

/** A list projection plus the admin-only extras, when `includeAdminFields` is set. */
export function withAdminColumns(columns: string, include?: boolean): string {
  return include ? `${columns}, ${ADMIN_EXTRA_COLUMNS}` : columns;
}

export const RESTAURANT_LIST_COLUMNS =
  "city, created_at, cuisine, data_quality_score, description, enhanced, google_place_id, id, image_url, is_featured, is_merged, is_sponsored, sponsored_until, latitude, location, longitude, merged_at, merged_into, name, opening, opening_date, opening_timeframe, phone, popularity_score, price_range, rating, slug, source_url, status, updated_at, website, writeup_generated_at";

// NOTE: keep every name here in sync with `public.events` AS DEPLOYED, not as
// migrated. A column that does not exist makes PostgREST reject the whole select
// with 42703, which surfaces as a blank events surface site-wide. WEB-QA-003 was
// that: `archived_at` was selected here before production had it and took out
// the homepage. It exists on `events` now (20260823000007_events_archived_at.sql
// adds it, and every events read filters on it), but it is still not in this
// projection because no card renders it; filters don't need a column selected.
//
// end_date (20260316000002_add_event_end_date.sql) is here so multi-day events
// can count as "happening now" (docs/page-plans/events.md WP0 item 3).
//
// time_tbd is deliberately NOT here yet. It arrives in 20260902000016, after the
// 2026-08-24 production snapshot; add it only once `npm run check-schema:probe`
// reports it present, or every events surface goes blank with 42703.
export const EVENT_LIST_COLUMNS =
  "category, city, created_at, date, end_date, enhanced_description, event_start_local, event_start_utc, event_timezone, id, image_url, is_enhanced, is_featured, is_sponsored, sponsored_until, latitude, location, longitude, original_description, price, source_url, title, updated_at, venue, writeup_generated_at";

// is_sponsored and sponsored_until are here because Attractions.tsx calls
// arrangeSponsored() on this list (WEB-FEAT-005) and the cards call
// isSponsoredActive(). Both columns exist on `attractions` but were absent from
// this projection, so every row arrived with them undefined and the sponsored
// boost had never once fired on that page. Restaurants and events already
// carry them; this brings attractions in line.
export const ATTRACTION_LIST_COLUMNS =
  "created_at, description, id, image_url, is_featured, is_sponsored, sponsored_until, latitude, location, longitude, name, rating, type, updated_at, website, address, hours_summary, hours, is_indoor, is_kid_friendly, is_free, is_active, accessibility_notes";

// Hotels: 43 columns, of which the list UI reads none of the SEO/GEO text or
// the gallery array. Verified by grepping every useHotels caller
// (pages/Hotels.tsx, components/EventHotelCallout.tsx,
// components/admin/HotelManager.tsx, pages/AdminContent.tsx) for seo_, geo_ and
// gallery_urls: zero hits, admin included -- the manager's form does not expose
// them either. Dropped: seo_title, seo_description, seo_keywords, seo_h1,
// geo_summary, geo_key_facts, geo_faq, gallery_urls.
export const HOTEL_LIST_COLUMNS =
  "address, affiliate_provider, affiliate_url, affiliate_url_updated_at, amenities, area, avg_nightly_rate, brand_parent, chain_name, check_in_time, check_out_time, city, created_at, description, email, google_place_id, hotel_type, id, image_url, is_active, is_featured, latitude, longitude, name, phone, price_range, short_description, slug, sort_order, star_rating, state, total_rooms, updated_at, website, zip";

/**
 * Playgrounds (WEB-PERF-035 AC2). useAdvancedSearch carried the comment "No
 * playground LIST_COLUMNS constant exists" and fell back to select('*').
 *
 * DERIVED FROM THE GENERATED TYPES, not from memory. My first version of this
 * constant named seven columns the table does not have - address, city,
 * has_water, hours, is_accessible, is_fenced, parking - which is precisely the
 * failure this file's own header warns about: PostgREST rejects the WHOLE
 * select with 42703 for one unknown name, and the surface goes blank.
 *
 * public.playgrounds has 20 columns and carries no seo_*, geo_*, search_vector
 * or geom at all, so there is nothing heavy to drop. What this constant buys is
 * therefore not payload but the invariant: a named projection fails loudly when
 * a column is renamed, where select('*') silently changes shape.
 *
 * Omitted: image_checked_at and manually_curated, both operational fields that
 * no list card reads (checked pages/Playgrounds.tsx, hooks/usePlaygrounds.ts,
 * hooks/useAdvancedSearch.ts). PlaygroundManager reads manually_curated, so the
 * admin path keeps its own query.
 */
export const PLAYGROUND_LIST_COLUMNS =
  "accessibility_notes, age_range, amenities, created_at, description, has_restrooms, has_shade, id, image_url, is_featured, latitude, location, longitude, name, rating, source, surface_type, updated_at";

/**
 * The four columns needed to DERIVE an event slug, and nothing else
 * (WEB-PERF-035 AC2).
 *
 * Events have no slug column - useEventBySlug fetches a candidate set and runs
 * createEventSlugWithCentralTime over it, which reads title, event_start_utc
 * and date. It was fetching those candidates with select('*'): a 3-day window
 * on the dated path, and up to 1000 rows on the legacy dateless path, every
 * one of them carrying the SEO/GEO text, search_vector and geom so that one of
 * them could be kept.
 *
 * The matched row is then re-fetched by id with select('*'), because the
 * detail page does render the SEO/GEO content. That is one extra round trip on
 * a cache miss against up to 999 discarded full rows.
 */
export const EVENT_SLUG_COLUMNS = "id, title, date, event_start_utc";
