package com.desmoines.aipulse.data.remote

import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * XPLAT-002: the receipt-validation verdict must survive decoding intact.
 *
 * BillingService used to decide entitlement with a raw-text substring check on
 * the response body. That is the defect this story replaced with
 * `validationJson.decodeFromString<ValidationResponse>(bodyString)` at
 * BillingService.kt:459, and these assertions are what stop it coming back.
 *
 * The substring approach fails in a specific and dangerous direction: a body
 * containing `"valid":false` still CONTAINS the substring `valid`, so a naive
 * check reads a rejection as an approval and a refunded user keeps their tier.
 * `substring check treats a rejection as an approval` below is that exact case.
 *
 * SCOPE, stated honestly: this covers the decode, which is the input to the
 * revocation branch at BillingService.kt:465-477. It does NOT assert the
 * revocation itself. That branch sits in a private suspend function which
 * reaches Google Play billing and a SupabaseClient, and BillingService requires
 * an Android Context, so asserting `_serverRevokedProductIDs` actually gains
 * the product id needs either Robolectric or a testability seam that does not
 * exist yet — `resolveTier` and `_serverRevokedProductIDs` are both private.
 * XPLAT-002 criterion 3 is therefore only partly met by this file, and the
 * remaining half is a refactor rather than a test.
 */
class ValidationResponseTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `a rejection decodes as invalid`() {
        val decoded = json.decodeFromString<ValidationResponse>(
            """{"valid":false,"reason":"Receipt refunded"}""",
        )
        assertFalse(decoded.valid, "valid:false must decode to false — this is the revoke branch")
        assertEquals("Receipt refunded", decoded.reason)
    }

    @Test
    fun `an approval decodes as valid`() {
        val decoded = json.decodeFromString<ValidationResponse>("""{"valid":true}""")
        assertTrue(decoded.valid)
        assertNull(decoded.reason)
    }

    @Test
    fun `substring check treats a rejection as an approval`() {
        // The regression, spelled out. Both bodies contain the text "valid",
        // so the old check could not tell them apart; the typed decode can.
        val rejection = """{"valid":false,"reason":"Subscription expired"}"""
        val approval = """{"valid":true}"""

        assertTrue(rejection.contains("valid"), "precondition: the old check matched this too")
        assertTrue(approval.contains("valid"))

        assertFalse(json.decodeFromString<ValidationResponse>(rejection).valid)
        assertTrue(json.decodeFromString<ValidationResponse>(approval).valid)
    }

    @Test
    fun `unknown fields do not break the decode`() {
        // CLAUDE.md backward-compat: the edge function may add response fields,
        // and older shipped binaries must keep decoding. ignoreUnknownKeys is
        // what makes that true, so it is asserted rather than assumed.
        val decoded = json.decodeFromString<ValidationResponse>(
            """{"valid":false,"reason":"Refunded","newFieldAddedLater":123,"another":{"nested":true}}""",
        )
        assertFalse(decoded.valid)
        assertEquals("Refunded", decoded.reason)
    }

    @Test
    fun `a rejection without a reason still decodes`() {
        // reason is nullable with a default; a verdict must never fail to decode
        // just because the server omitted the explanation.
        val decoded = json.decodeFromString<ValidationResponse>("""{"valid":false}""")
        assertFalse(decoded.valid)
        assertNull(decoded.reason)
    }
}
