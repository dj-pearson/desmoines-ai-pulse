package com.desmoines.aipulse.data.remote

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * XPLAT-002 AC3: an invalid receipt must revoke, and nothing else may.
 *
 * ValidationResponseTest next door asserts the INPUT to the revoke branch --
 * that a rejection decodes as a rejection. This asserts the DECISION taken from
 * that input, which is the half the story actually asks for.
 *
 * Why this needed an extraction rather than a test against BillingService: the
 * branch sits in a private suspend function that reaches Google Play billing and
 * a SupabaseClient, BillingService requires an Android Context, and
 * _serverRevokedProductIDs is private. validationOutcome pulls the rule out to
 * where a plain JUnit test can reach it. What is still not covered is the two
 * lines that translate a decision into `_serverRevokedProductIDs.value += id`
 * and a recomputeCurrentTier() -- that needs Robolectric or a wider refactor.
 *
 * THE THIRD CASE IS THE ONE THAT MATTERS MOST, and it is easy to get backwards.
 * validate-android-receipt returns valid:false for auth failures, bad input and
 * "Server configuration error" as well as for genuine rejections. Treating every
 * valid:false as definitive would revoke EVERY paying subscriber during a
 * backend outage. Only a 2xx body is a verdict.
 */
class ValidationOutcomeTest {

    @Test
    fun `a 2xx rejection revokes`() {
        assertEquals(
            ValidationOutcome.REVOKE,
            validationOutcome(isSuccessStatus = true, valid = false),
        )
    }

    @Test
    fun `a 2xx approval grants`() {
        assertEquals(
            ValidationOutcome.GRANT,
            validationOutcome(isSuccessStatus = true, valid = true),
        )
    }

    @Test
    fun `a non-2xx rejection is not a verdict and must not revoke`() {
        // A 500 carrying valid:false is a backend outage, not a refund.
        assertEquals(
            ValidationOutcome.NO_VERDICT,
            validationOutcome(isSuccessStatus = false, valid = false),
        )
    }

    @Test
    fun `a non-2xx approval is not a verdict either`() {
        // Symmetry: a failed request must not grant entitlement any more than it
        // revokes one.
        assertEquals(
            ValidationOutcome.NO_VERDICT,
            validationOutcome(isSuccessStatus = false, valid = true),
        )
    }

    @Test
    fun `a 2xx body that did not decode is not a verdict`() {
        // Failing toward NO_VERDICT keeps a malformed response from revoking
        // anyone. The alternative -- treating an undecodable body as invalid --
        // turns one bad deploy into mass revocation.
        assertEquals(
            ValidationOutcome.NO_VERDICT,
            validationOutcome(isSuccessStatus = true, valid = null),
        )
    }

    @Test
    fun `only a 2xx rejection revokes, across every combination`() {
        // Exhaustive over the input space, so a future edit to the when-branches
        // cannot quietly widen what revokes.
        val revoking = listOf(true, false).flatMap { ok ->
            listOf(true, false, null).map { valid -> Triple(ok, valid, validationOutcome(ok, valid)) }
        }.filter { it.third == ValidationOutcome.REVOKE }

        assertEquals(
            listOf(Triple(true, false, ValidationOutcome.REVOKE)),
            revoking,
            "exactly one input combination may revoke: a 2xx body saying valid:false",
        )
    }
}
