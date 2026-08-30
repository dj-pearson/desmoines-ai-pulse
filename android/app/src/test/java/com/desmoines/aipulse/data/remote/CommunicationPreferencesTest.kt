package com.desmoines.aipulse.data.remote

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * The two rules that decide whether a stored opt-out survives (WEB-LEGAL-012).
 *
 * Both have already failed in production on the web client, which is why they
 * are asserted here rather than left to review: PreferencesManager replaced the
 * shared jsonb bag instead of merging into it and deleted the marketing key, and
 * because absence means consent, deleting the key opted those users back in with
 * nothing failing anywhere.
 */
class CommunicationPreferencesTest {

    private val existing = buildJsonObject {
        put("email_notifications", false)
        put("sms_notifications", true)
        put("taste_preferences", buildJsonObject { put("cuisine", "italian") })
    }

    @Test
    fun `merge keeps every key it did not set`() {
        val merged = CommunicationPreferences.merge(existing, "email_notifications", true)

        assertEquals(existing.keys, merged.keys, "merge dropped a key")
        assertEquals(existing["sms_notifications"], merged["sms_notifications"])
        assertEquals(existing["taste_preferences"], merged["taste_preferences"])
    }

    @Test
    fun `merge sets the key it was given`() {
        val merged = CommunicationPreferences.merge(existing, "email_notifications", true)
        assertTrue(CommunicationPreferences.isOptedIn(merged, "email_notifications"))
    }

    @Test
    fun `merge adds a key that was not there`() {
        val merged = CommunicationPreferences.merge(JsonObject(emptyMap()), "email_notifications", false)
        assertEquals(setOf("email_notifications"), merged.keys)
        assertFalse(CommunicationPreferences.isOptedIn(merged, "email_notifications"))
    }

    @Test
    fun `an absent bag reads as opted in`() {
        // The senders test `!== false`, so a user with no preferences row is a
        // user who has not opted out. Defaulting to false here would show every
        // new user an opt-out they do not have.
        assertTrue(CommunicationPreferences.isOptedIn(null, "email_notifications"))
    }

    @Test
    fun `an absent key reads as opted in`() {
        val bag = buildJsonObject { put("sms_notifications", false) }
        assertTrue(CommunicationPreferences.isOptedIn(bag, "email_notifications"))
    }

    @Test
    fun `only an explicit false opts out`() {
        val no = buildJsonObject { put("email_notifications", false) }
        val yes = buildJsonObject { put("email_notifications", true) }

        assertFalse(CommunicationPreferences.isOptedIn(no, "email_notifications"))
        assertTrue(CommunicationPreferences.isOptedIn(yes, "email_notifications"))
    }

    @Test
    fun `a non-boolean value reads as opted in, matching the server`() {
        // `"false" !== false` is true in JS, so the senders would mail this user.
        // Reading it as opted OUT here would show a state the user does not have.
        val stringy = Json.parseToJsonElement("""{"email_notifications":"false"}""") as JsonObject
        val objecty = Json.parseToJsonElement("""{"email_notifications":{}}""") as JsonObject
        val nully = Json.parseToJsonElement("""{"email_notifications":null}""") as JsonObject

        assertTrue(CommunicationPreferences.isOptedIn(stringy, "email_notifications"))
        assertTrue(CommunicationPreferences.isOptedIn(objecty, "email_notifications"))
        assertTrue(CommunicationPreferences.isOptedIn(nully, "email_notifications"))
    }

    @Test
    fun `the key matches what the web clients write and the classifier reads`() {
        // marketing-consent-contract.test.ts asserts writer and reader agree on
        // the web side. This is the third client joining that contract; renaming
        // it here alone makes every Android opt-out invisible to every sender.
        assertEquals("email_notifications", CommunicationPreferences.EMAIL_NOTIFICATIONS)
    }
}
