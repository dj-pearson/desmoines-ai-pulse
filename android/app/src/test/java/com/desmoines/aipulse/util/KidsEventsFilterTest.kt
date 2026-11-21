package com.desmoines.aipulse.util

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * AND-AUDIT-041. /events/kids runs the web's KIDS_EVENTS_FILTER. The literal
 * below is the web's string; src/lib/__tests__/androidKidsEventsParity.test.ts
 * reads KidsEventsFilter.kt and compares it to the TypeScript export itself, so
 * a change on either side fails there even if this copy is updated.
 */
class KidsEventsFilterTest {

    private val web =
        "title.imatch.\"[[:<:]](kids?|child|children|family|families|toddlers?|preschool|storytime|story time|teens?)[[:>:]]\"," +
            "category.imatch.\"[[:<:]](kids?|family|children)[[:>:]]\"," +
            "enhanced_description.imatch.\"[[:<:]](kids|children|toddlers)[[:>:]]\""

    @Test
    fun `the or-group is the web's filter byte for byte`() {
        assertEquals(web, KidsEventsFilter.OR_GROUP)
    }

    @Test
    fun `every pattern is quoted, since PostgREST reserves colons and parentheses in or()`() {
        KidsEventsFilter.ARMS.forEach {
            assertTrue(it.pattern.startsWith("\"") && it.pattern.endsWith("\""), it.column)
        }
    }

    /**
     * Postgres [[:<:]] and [[:>:]] are word boundaries; Java spells both \b.
     * This runs the same alternatives the way Postgres ~* would.
     */
    private fun matches(column: String, text: String): Boolean {
        val arm = KidsEventsFilter.ARMS.single { it.column == column }
        val regex = arm.pattern.trim('"')
            .replace("[[:<:]]", "\\b")
            .replace("[[:>:]]", "\\b")
        return Regex(regex, RegexOption.IGNORE_CASE).containsMatchIn(text)
    }

    @Test
    fun `a storytime or a children's show qualifies without the word kids`() {
        assertTrue(matches("title", "Toddler Storytime at Central Library"))
        assertTrue(matches("title", "Children's Theatre: Charlotte's Web"))
        assertTrue(matches("category", "Family"))
    }

    @Test
    fun `kidney, a family-owned brewery and a bare kid do not`() {
        assertFalse(matches("title", "Kidney Foundation Gala"))
        assertFalse(matches("enhanced_description", "Live music at a family-owned brewery"))
        assertFalse(matches("enhanced_description", "Every kid gets a sticker"))
    }
}
