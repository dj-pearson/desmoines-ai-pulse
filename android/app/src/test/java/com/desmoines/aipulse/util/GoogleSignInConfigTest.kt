package com.desmoines.aipulse.util

import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialUnknownException
import androidx.credentials.exceptions.NoCredentialException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class GoogleSignInConfigTest {

    @Test
    fun `accepts a real web client id`() {
        assertTrue(isGoogleSignInConfigured("123456789012-abcdefghijklmnop.apps.googleusercontent.com"))
        assertTrue(isGoogleSignInConfigured("  123-abc.apps.googleusercontent.com  "))
    }

    @Test
    fun `rejects blank values`() {
        assertFalse(isGoogleSignInConfigured(null))
        assertFalse(isGoogleSignInConfigured(""))
        assertFalse(isGoogleSignInConfigured("   "))
    }

    @Test
    fun `rejects placeholder values in any case`() {
        assertFalse(isGoogleSignInConfigured("placeholder.apps.googleusercontent.com"))
        assertFalse(isGoogleSignInConfigured("000-PLACEHOLDER.apps.googleusercontent.com"))
        assertFalse(isGoogleSignInConfigured("your-placeholder-client-id"))
    }

    @Test
    fun `rejects values that are not a google client id`() {
        assertFalse(isGoogleSignInConfigured("123-abc"))
        assertFalse(isGoogleSignInConfigured("123-abc.apps.googleusercontent.com.evil.example"))
        assertFalse(isGoogleSignInConfigured("https://accounts.google.com"))
        assertFalse(isGoogleSignInConfigured(".apps.googleusercontent.com"))
    }

    @Test
    fun `cancellation is silent`() {
        assertNull(googleSignInErrorMessage(GetCredentialCancellationException()))
    }

    @Test
    fun `no credential names the missing account`() {
        assertEquals(
            "No Google account available on this device",
            googleSignInErrorMessage(NoCredentialException()),
        )
    }

    @Test
    fun `any other failure is shown`() {
        assertEquals(GOOGLE_SIGN_IN_FAILED_MESSAGE, googleSignInErrorMessage(GetCredentialUnknownException()))
        assertEquals(GOOGLE_SIGN_IN_FAILED_MESSAGE, googleSignInErrorMessage(IllegalStateException("boom")))
    }
}
