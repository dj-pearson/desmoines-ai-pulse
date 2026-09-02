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
 */

export const RESTAURANT_LIST_COLUMNS =
  "ai_writeup, city, created_at, cuisine, data_quality_score, description, enhanced, google_place_id, id, image_url, is_featured, is_merged, is_sponsored, sponsored_until, latitude, location, longitude, merged_at, merged_into, name, opening, opening_date, opening_timeframe, phone, popularity_score, price_range, rating, slug, source_url, status, updated_at, website, writeup_generated_at";

// NOTE: keep every name here in sync with `public.events`. A column that does not
// exist makes PostgREST reject the whole select with 42703, which surfaces as a
// blank events surface site-wide (see WEB-QA-003 — `archived_at` lives on
// `archived_events`/`event_archive`, never on `events`, and took out the homepage).
export const EVENT_LIST_COLUMNS =
  "ai_writeup, category, city, created_at, date, enhanced_description, event_start_local, event_start_utc, event_timezone, id, image_url, is_enhanced, is_featured, is_sponsored, sponsored_until, latitude, location, longitude, original_description, price, source_url, title, updated_at, venue, writeup_generated_at";

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
