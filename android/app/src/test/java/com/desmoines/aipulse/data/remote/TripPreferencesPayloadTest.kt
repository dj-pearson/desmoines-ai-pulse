package com.desmoines.aipulse.data.remote

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Pins the generate-itinerary request payload (XPLAT-010).
 *
 * TripPreferences previously carried 5 of the 10 fields the edge function
 * accepts (generate-itinerary/index.ts:35-52), so accessibilityNeeds and
 * dietaryRestrictions were unreachable on Android — users with an access need
 * or a dietary restriction could not express it at all, while web could.
 *
 * Two properties matter and are asserted here:
 *   1. Populated optional fields actually reach the payload.
 *   2. EMPTY optional fields are omitted entirely, so a request that does not
 *      use them is byte-identical to the pre-change payload. That keeps this a
 *      purely additive change per CLAUDE.md.
 *
 * This mirrors the production builder in TripPlannerRemoteDataSource.generate;
 * if that builder changes shape, this test must change with it deliberately.
 */
class TripPreferencesPayloadTest {

    /** Same construction as TripPlannerRemoteDataSource.generate. */
    private fun buildPayload(startDate: String, endDate: String, prefs: TripPreferences): JsonObject =
        buildJsonObject {
            put("startDate", startDate)
            put("endDate", endDate)
            putJsonObject("preferences") {
                putJsonArray("interests") { prefs.interests.forEach { add(it) } }
                put("budget", prefs.budget)
                put("pace", prefs.pace)
                put("groupSize", prefs.groupSize)
                put("hasChildren", prefs.hasChildren)
                if (prefs.childAges.isNotEmpty()) {
                    putJsonArray("childAges") { prefs.childAges.forEach { add(it) } }
                }
                if (prefs.accessibilityNeeds.isNotEmpty()) {
                    putJsonArray("accessibilityNeeds") { prefs.accessibilityNeeds.forEach { add(it) } }
                }
                if (prefs.dietaryRestrictions.isNotEmpty()) {
                    putJsonArray("dietaryRestrictions") { prefs.dietaryRestrictions.forEach { add(it) } }
                }
                if (prefs.mustSee.isNotEmpty()) {
                    putJsonArray("mustSee") { prefs.mustSee.forEach { add(it) } }
                }
                if (prefs.avoidCategories.isNotEmpty()) {
                    putJsonArray("avoidCategories") { prefs.avoidCategories.forEach { add(it) } }
                }
            }
        }

    private fun basePrefs() = TripPreferences(
        interests = listOf("food", "music"),
        budget = "moderate",
        pace = "relaxed",
        groupSize = 2,
        hasChildren = false,
    )

    @Test
    fun `accessibility needs reach the payload`() {
        val payload = buildPayload(
            "2026-08-01",
            "2026-08-03",
            basePrefs().copy(accessibilityNeeds = listOf("wheelchair accessible", "step-free entry")),
        )

        val needs = payload["preferences"]!!.jsonObject["accessibilityNeeds"]!!.jsonArray
        assertEquals(2, needs.size)
        assertEquals("wheelchair accessible", needs[0].jsonPrimitive.content)
        assertEquals("step-free entry", needs[1].jsonPrimitive.content)
    }

    @Test
    fun `dietary restrictions reach the payload`() {
        val payload = buildPayload(
            "2026-08-01",
            "2026-08-03",
            basePrefs().copy(dietaryRestrictions = listOf("vegan", "nut allergy")),
        )

        val diet = payload["preferences"]!!.jsonObject["dietaryRestrictions"]!!.jsonArray
        assertEquals(listOf("vegan", "nut allergy"), diet.map { it.jsonPrimitive.content })
    }

    @Test
    fun `unused optional fields are omitted entirely`() {
        val preferences = buildPayload("2026-08-01", "2026-08-03", basePrefs())["preferences"]!!.jsonObject

        // The five that shipped before must still be present...
        assertTrue(preferences.containsKey("interests"))
        assertTrue(preferences.containsKey("budget"))
        assertTrue(preferences.containsKey("pace"))
        assertTrue(preferences.containsKey("groupSize"))
        assertTrue(preferences.containsKey("hasChildren"))

        // ...and the five new ones must NOT appear as empty arrays. Sending
        // `"accessibilityNeeds": []` is a different request than sending
        // nothing, and could steer the model differently.
        assertFalse(preferences.containsKey("childAges"))
        assertFalse(preferences.containsKey("accessibilityNeeds"))
        assertFalse(preferences.containsKey("dietaryRestrictions"))
        assertFalse(preferences.containsKey("mustSee"))
        assertFalse(preferences.containsKey("avoidCategories"))
        assertEquals(5, preferences.size, "payload must be unchanged when no optional field is set")
    }

    @Test
    fun `all ten fields are expressible`() {
        val preferences = buildPayload(
            "2026-08-01",
            "2026-08-03",
            TripPreferences(
                interests = listOf("arts"),
                budget = "splurge",
                pace = "packed",
                groupSize = 4,
                hasChildren = true,
                childAges = listOf(4, 9),
                accessibilityNeeds = listOf("accessible parking"),
                dietaryRestrictions = listOf("gluten-free"),
                mustSee = listOf("Pappajohn Sculpture Park"),
                avoidCategories = listOf("nightlife"),
            ),
        )["preferences"]!!.jsonObject

        assertEquals(10, preferences.size, "all ten documented fields must be expressible")
        assertEquals(listOf(4, 9), preferences["childAges"]!!.jsonArray.map { it.jsonPrimitive.content.toInt() })
        assertEquals("nightlife", preferences["avoidCategories"]!!.jsonArray[0].jsonPrimitive.content)
    }
}
