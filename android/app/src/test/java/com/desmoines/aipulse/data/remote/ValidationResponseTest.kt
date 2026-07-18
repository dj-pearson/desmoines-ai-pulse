package com.desmoines.aipulse.data.remote

import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Contract lock for the `validate-android-receipt` response (XPLAT-002).
 *
 * This decode replaced a raw-text substring check:
 *
 *     bodyString.contains("\"valid\":true") || bodyString.contains("\"valid\": true")
 *
 * which made entitlement depend on the backend's JSON *formatting*. Any
 * whitespace or key-ordering change — including a purely additive one, which
 * CLAUDE.md classifies as always-safe — silently flipped every validation to
 * the invalid path on already-shipped binaries. These tests pin the shapes the
 * edge function actually emits (validate-android-receipt/index.ts:14-15) so the
 * decode cannot drift the same way.
 *
 * Mirrors the iOS contract lock on StoreKitService.ValidationResponse.
 */
class ValidationResponseTest {

    private val json = Json { ignoreUnknownKeys = true }

    private fun decode(raw: String) = json.decodeFromString<ValidationResponse>(raw)

    @Test
    fun `decodes the documented success shape`() {
        val decoded = decode(
            """{"valid":true,"entitlement":{"tier":"vip","expiresAt":"2026-12-31T00:00:00Z"}}"""
        )

        assertTrue(decoded.valid)
        assertEquals("vip", decoded.entitlement?.tier)
        assertEquals("2026-12-31T00:00:00Z", decoded.entitlement?.expiresAt)
        assertNull(decoded.reason)
    }

    @Test
    fun `decodes the documented rejection shape`() {
        val decoded = decode("""{"valid":false,"reason":"Purchase not found with Google Play"}""")

        assertFalse(decoded.valid)
        assertEquals("Purchase not found with Google Play", decoded.reason)
        assertNull(decoded.entitlement)
    }

    @Test
    fun `formatting is irrelevant to the verdict`() {
        // Every one of these broke the old substring check, or passed it for the
        // wrong reason. They must all decode identically now.
        assertTrue(decode("""{"valid": true,"entitlement":{"tier":"insider"}}""").valid)
        assertTrue(decode("""{ "entitlement" : { "tier" : "insider" } , "valid" : true }""").valid)
        assertTrue(decode("{\n  \"valid\":\ttrue\n}").valid)
        assertFalse(decode("""{"valid": false,"reason":"refunded"}""").valid)
    }

    @Test
    fun `a reason containing the literal valid-true text does not flip the verdict`() {
        // The old check scanned the WHOLE body, so a rejection whose reason text
        // happened to contain the marker would be read as success — granting
        // entitlement on an explicit rejection.
        val decoded = decode("""{"valid":false,"reason":"expected \"valid\":true but token was refunded"}""")

        assertFalse(decoded.valid, "verdict must come from the field, not from anywhere in the body")
    }

    @Test
    fun `additive backend fields do not break shipped binaries`() {
        // CLAUDE.md treats adding a response field as always safe. That is only
        // true if the client ignores unknown keys.
        val decoded = decode(
            """{"valid":true,"entitlement":{"tier":"vip","expiresAt":null,"gracePeriodEnd":"x"},
                "newTopLevelField":123,"anotherOne":{"nested":true}}"""
        )

        assertTrue(decoded.valid)
        assertEquals("vip", decoded.entitlement?.tier)
        assertNull(decoded.entitlement?.expiresAt)
    }

    @Test
    fun `entitlement is optional on success and fields are individually nullable`() {
        val decoded = decode("""{"valid":true}""")

        assertTrue(decoded.valid)
        assertNull(decoded.entitlement)
    }
}
