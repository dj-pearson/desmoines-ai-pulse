package com.desmoines.aipulse.util

import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/**
 * The site page a shared restaurant, attraction or hotel links to
 * (AND-AUDIT-034), and the line that carries it.
 *
 * All three share texts ended "Found on Des Moines Insider" with no link, the
 * gap AND-AUDIT-033 closed for events. Each URL here is one the web router
 * resolves and DeepLinkHandler routes back into the app:
 *
 * - restaurants: /restaurants/<slug or id>. RestaurantDetails.tsx looks up a
 *   UUID by id and anything else by slug, and iOS shareURL prefers the slug.
 * - attractions: /attractions/<slug>. The web resolves by slug only (a UUID
 *   link would 404), through the slug column from migration 20260919000008 or,
 *   before that is applied, createSlug(name). The backfill sets slug to
 *   content_slug(name), so the name slug is the same URL for every row that
 *   does not collide. iOS shares nothing without a slug; Android keeps the
 *   name fallback because the column may not be in production yet.
 * - hotels: /stay/<slug>. useHotel looks up by slug only and the column is
 *   NOT NULL, so a hotel without one gets no link rather than a dead one.
 */
object PlaceShareLinks {

    const val FOOTER = "Found on Des Moines Insider"

    fun restaurantUrl(slug: String?, id: String): String =
        page("restaurants", slug?.takeIf { it.isNotBlank() } ?: id)

    fun attractionUrl(slug: String?, name: String?): String? {
        val key = slug?.takeIf { it.isNotBlank() } ?: EventSlug.slugify(name).takeIf { it.isNotEmpty() }
        return key?.let { page("attractions", it) }
    }

    fun hotelUrl(slug: String?): String? =
        slug?.takeIf { it.isNotBlank() }?.let { page("stay", it) }

    /**
     * The footer that ends every share text, with the link when there is one:
     * "Found on Des Moines Insider: <url>", the shape EventShareText uses.
     */
    fun footer(url: String?): String = if (url == null) FOOTER else "$FOOTER: $url"

    private fun page(section: String, key: String): String =
        "${Config.SITE_URL}/$section/" +
            URLEncoder.encode(key, StandardCharsets.UTF_8.name()).replace("+", "%20")
}
