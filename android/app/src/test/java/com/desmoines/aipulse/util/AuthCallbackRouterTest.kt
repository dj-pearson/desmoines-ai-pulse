package com.desmoines.aipulse.util

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.withTimeout
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AuthCallbackRouterTest {

    private val base = "com.desmoines.aipulse://auth-callback"

    // --- Confirmation ---

    @Test
    fun `PKCE confirmation link is a Confirmation carrying its code`() {
        assertEquals(
            AuthCallback.Confirmation("abc-123"),
            AuthCallbackRouter.classify("$base?code=abc-123"),
        )
    }

    @Test
    fun `callback with no parameters is a Confirmation without a code`() {
        assertEquals(AuthCallback.Confirmation(null), AuthCallbackRouter.classify(base))
    }

    @Test
    fun `scheme and host match case-insensitively`() {
        assertEquals(
            AuthCallback.Confirmation("c"),
            AuthCallbackRouter.classify("COM.DESMOINES.AIPULSE://Auth-Callback?code=c"),
        )
    }

    // --- Recovery ---

    @Test
    fun `flow=recovery is a Recovery`() {
        assertEquals(
            AuthCallback.Recovery("r1"),
            AuthCallbackRouter.classify("$base?code=r1&flow=recovery"),
        )
    }

    @Test
    fun `implicit-flow type=recovery in the fragment is a Recovery`() {
        assertEquals(
            AuthCallback.Recovery(null),
            AuthCallbackRouter.classify("$base#access_token=t&type=recovery"),
        )
    }

    // --- Error ---

    @Test
    fun `expired link in the fragment is an Error with the expiry message`() {
        val result = AuthCallbackRouter.classify(
            "$base#error=access_denied&error_code=otp_expired" +
                "&error_description=Email+link+is+invalid+or+has+expired",
        )
        assertTrue(result is AuthCallback.Error)
        assertTrue((result as AuthCallback.Error).message.contains("expired"))
    }

    @Test
    fun `error in the query decodes the description`() {
        val result = AuthCallbackRouter.classify(
            "$base?error=server_error&error_description=Database%20error%20saving%20user",
        )
        assertEquals(
            AuthCallback.Error("That sign-in link didn't work: Database error saving user"),
            result,
        )
    }

    @Test
    fun `error wins over a recovery flow and a code`() {
        val result = AuthCallbackRouter.classify(
            "$base?code=x&flow=recovery&error_description=bad",
        )
        assertTrue(result is AuthCallback.Error)
    }

    @Test
    fun `blank error_description is not an error`() {
        assertEquals(
            AuthCallback.Confirmation("x"),
            AuthCallbackRouter.classify("$base?code=x&error_description="),
        )
    }

    // --- NotAuth ---

    @Test
    fun `other app deep links are NotAuth`() {
        assertEquals(AuthCallback.NotAuth, AuthCallbackRouter.classify("com.desmoines.aipulse://event/42"))
        assertEquals(AuthCallback.NotAuth, AuthCallbackRouter.classify("com.desmoines.aipulse://ask-pulse?q=x"))
    }

    @Test
    fun `web link mentioning auth-callback in the path is NotAuth`() {
        assertEquals(
            AuthCallback.NotAuth,
            AuthCallbackRouter.classify("https://desmoinesinsider.com/auth-callback?code=x"),
        )
    }

    @Test
    fun `null blank and malformed input are NotAuth`() {
        assertEquals(AuthCallback.NotAuth, AuthCallbackRouter.classify(null))
        assertEquals(AuthCallback.NotAuth, AuthCallbackRouter.classify("  "))
        assertEquals(AuthCallback.NotAuth, AuthCallbackRouter.classify("com.desmoines.aipulse://auth callback"))
    }

    // --- AuthCallbackNotices ---

    @Test
    fun `successful exchange posts SignedIn with the message`() = runBlocking {
        val notices = AuthCallbackNotices(UnconfinedTestDispatcher())
        var exchanged: String? = null

        notices.exchange("code-1", AuthCallbackNotices.CONFIRMED_MESSAGE) { exchanged = it }

        val notice = withTimeout(5_000) { notices.pending.filterNotNull().first() }
        assertEquals("code-1", exchanged)
        assertEquals(AuthCallbackNotices.Notice.SignedIn(AuthCallbackNotices.CONFIRMED_MESSAGE), notice)
    }

    @Test
    fun `failed exchange posts Failed instead of throwing`() = runBlocking {
        val notices = AuthCallbackNotices(UnconfinedTestDispatcher())

        notices.exchange("spent", AuthCallbackNotices.CONFIRMED_MESSAGE) {
            throw IllegalStateException("invalid flow state")
        }

        val notice = withTimeout(5_000) { notices.pending.filterNotNull().first() }
        assertEquals(
            AuthCallbackNotices.Notice.Failed(AuthCallbackNotices.EXCHANGE_FAILED_MESSAGE),
            notice,
        )
    }

    @Test
    fun `a successful recovery exchange posts PasswordRecovery, not SignedIn`() = runBlocking {
        // AND-OVH-006: a reset link must land on SetNewPassword, not on Home.
        val notices = AuthCallbackNotices(UnconfinedTestDispatcher())

        notices.exchange("reset-code", AuthCallbackNotices.Notice.PasswordRecovery) {}

        val notice = withTimeout(5_000) { notices.pending.filterNotNull().first() }
        assertEquals(AuthCallbackNotices.Notice.PasswordRecovery, notice)
    }

    @Test
    fun `consume clears the pending notice`() {
        val notices = AuthCallbackNotices(UnconfinedTestDispatcher())
        notices.post(AuthCallbackNotices.Notice.Failed("x"))

        assertEquals(AuthCallbackNotices.Notice.Failed("x"), notices.consume())
        assertNull(notices.pending.value)
        assertNull(notices.consume())
    }
}
