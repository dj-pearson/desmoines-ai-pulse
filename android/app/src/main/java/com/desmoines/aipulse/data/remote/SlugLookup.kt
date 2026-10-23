package com.desmoines.aipulse.data.remote

/**
 * Which column a detail link's value is looked up by (AND-OVH-022).
 *
 * Notifications, favorites and in-app lists pass a row id; web URLs pass a
 * slug. restaurants, hotels and articles have a `slug` column (confirmed in
 * scripts/db-snapshot.json), so a non-UUID value is an eq on it. events and
 * attractions do not, and resolve slugs their own way.
 */
object SlugLookup {

    private val UUID_PATTERN =
        Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

    fun isUuid(value: String): Boolean = UUID_PATTERN.matches(value)

    /** "id" for a UUID, "slug" for anything else. */
    fun column(value: String): String = if (isUuid(value)) "id" else "slug"
}

/** A slug or id that names no row. Distinct from a network failure, so a screen can say "not found". */
class EntityNotFoundException(message: String) : NoSuchElementException(message)
