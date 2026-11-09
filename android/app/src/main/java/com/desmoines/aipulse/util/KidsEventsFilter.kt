package com.desmoines.aipulse.util

/**
 * The web's kids-and-family rule for /events/kids (KIDS_EVENTS_FILTER in
 * src/hooks/useEventLanding.ts), which iOS ports as
 * EventsService.kidsEventsFilter (IOS-AUDIT-005). Android used to search the
 * text "kids events", which full-text search reads as the word "kids", so a
 * family storytime or a children's show without "kids" in it was missing
 * (AND-AUDIT-041).
 *
 * Each arm is a case-insensitive POSIX regex (PostgREST imatch) with Postgres
 * word boundaries, so "kids" does not match "kidney". The description arm
 * takes only plural or explicit child words: a "family-owned brewery" is not
 * a kids event. Patterns are double-quoted because PostgREST reserves ":" and
 * parentheses inside an or() value.
 *
 * src/lib/__tests__/androidKidsEventsParity.test.ts reads the [ARMS] below and
 * holds them equal to the web's filter, so keep each arm on one line in this
 * shape.
 */
object KidsEventsFilter {

    /** One or() arm: [column] imatch [pattern]. */
    data class Arm(val column: String, val pattern: String)

    /** `"[[:<:]](alternatives)[[:>:]]"`, the web's wordRe. */
    fun wordPattern(alternatives: String): String = "\"[[:<:]]($alternatives)[[:>:]]\""

    val ARMS: List<Arm> = listOf(
        Arm("title", wordPattern("kids?|child|children|family|families|toddlers?|preschool|storytime|story time|teens?")),
        Arm("category", wordPattern("kids?|family|children")),
        Arm("enhanced_description", wordPattern("kids|children|toddlers")),
    )

    /**
     * The or() body as supabase-kt's `or { imatch(...) }` renders it, without
     * the surrounding parentheses. Equal to the web's KIDS_EVENTS_FILTER.
     */
    val OR_GROUP: String = ARMS.joinToString(",") { "${it.column}.imatch.${it.pattern}" }
}
