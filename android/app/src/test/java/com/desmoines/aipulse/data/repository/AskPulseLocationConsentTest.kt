package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.model.LatLng
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test

/**
 * The Settings location toggle has to control what discover-chat receives
 * (AND-OVH-002). Before this the repository sent any fix it was handed and
 * nothing read the toggle, so Data safety could not call location optional.
 */
class AskPulseLocationConsentTest {

    private val messages = listOf(DiscoverChatMessage(role = "user", content = "brunch"))
    private val fix = LatLng(latitude = 41.5868, longitude = -93.625)

    @Test
    fun `consent off drops userLocation even with a fix`() {
        val body = buildDiscoverChatPayload(messages, fix, locationConsent = false)
        assertFalse(body.containsKey("userLocation"), "body was $body")
    }

    @Test
    fun `consent on sends latitude and longitude`() {
        val body = buildDiscoverChatPayload(messages, fix, locationConsent = true)
        assertNotNull(body["userLocation"], "body was $body")
        val location = body.getValue("userLocation").jsonObject
        assertEquals(41.5868, location.getValue("latitude").jsonPrimitive.double)
        assertEquals(-93.625, location.getValue("longitude").jsonPrimitive.double)
    }

    @Test
    fun `consent on without a fix omits userLocation`() {
        val body = buildDiscoverChatPayload(messages, location = null, locationConsent = true)
        assertFalse(body.containsKey("userLocation"))
    }

    @Test
    fun `messages go out unchanged whatever the consent`() {
        for (consent in listOf(true, false)) {
            val body: JsonObject = buildDiscoverChatPayload(messages, fix, consent)
            val sent = body.getValue("messages").jsonArray.single().jsonObject
            assertEquals("user", sent.getValue("role").jsonPrimitive.content)
            assertEquals("brunch", sent.getValue("content").jsonPrimitive.content)
        }
    }
}
