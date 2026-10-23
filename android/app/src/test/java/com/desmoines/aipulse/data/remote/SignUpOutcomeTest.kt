package com.desmoines.aipulse.data.remote

import io.github.jan.supabase.postgrest.exception.PostgrestRestException
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class SignUpOutcomeTest {

    private fun postgrestError(code: String): PostgrestRestException =
        mockk { every { this@mockk.code } returns code }

    @Test
    fun `no session after signUp means confirmation required, not failure`() = runTest {
        var inserted = false

        val outcome = SignUpOutcome.resolve(
            email = "new@example.com",
            sessionUserId = null,
        ) { inserted = true }

        assertEquals(SignUpOutcome.ConfirmationRequired("new@example.com"), outcome)
        // An anon insert would only be refused by RLS; the trigger owns this row.
        assertFalse(inserted)
    }

    @Test
    fun `a session inserts the profile and signs in`() = runTest {
        var insertedFor: String? = null

        val outcome = SignUpOutcome.resolve(
            email = "new@example.com",
            sessionUserId = "user-1",
        ) { insertedFor = it }

        assertSame(SignUpOutcome.SignedIn, outcome)
        assertEquals("user-1", insertedFor)
    }

    @Test
    fun `23505 on the profile insert counts as success`() = runTest {
        val outcome = SignUpOutcome.resolve(
            email = "new@example.com",
            sessionUserId = "user-1",
        ) { throw postgrestError("23505") }

        assertSame(SignUpOutcome.SignedIn, outcome)
    }

    @Test
    fun `any other postgrest error on the insert is a failure`() = runTest {
        val error = postgrestError("42501")

        val thrown = assertThrows<PostgrestRestException> {
            SignUpOutcome.resolve(email = "new@example.com", sessionUserId = "user-1") { throw error }
        }

        assertSame(error, thrown)
    }

    @Test
    fun `a non-postgrest insert error is a failure`() = runTest {
        assertThrows<IllegalStateException> {
            SignUpOutcome.resolve(email = "new@example.com", sessionUserId = "user-1") {
                throw IllegalStateException("network down")
            }
        }
    }

    @Test
    fun `unique violation is recognised only by its code`() {
        assertTrue(SignUpOutcome.isUniqueViolation(postgrestError("23505")))
        assertFalse(SignUpOutcome.isUniqueViolation(postgrestError("23503")))
        assertFalse(SignUpOutcome.isUniqueViolation(RuntimeException("23505")))
    }
}
