package com.desmoines.aipulse.data.remote

import android.content.SharedPreferences
import io.mockk.every
import io.mockk.mockk
import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

class AffiliateAllowlistTest {

    private lateinit var prefs: SharedPreferences
    private val json = Json { ignoreUnknownKeys = true }

    @BeforeEach
    fun setup() {
        prefs = mockk(relaxed = true)
        // No remotely-synced extras by default.
        every { prefs.getString(any(), null) } returns null
    }

    private fun service() = AffiliateAdService(prefs, json)

    @Test
    fun `built-in partner domains are allowed`() {
        val svc = service()
        assertTrue(svc.isValidAffiliateUrl("https://hyatt.jewn.net/DWyqGG"))
        assertTrue(svc.isValidAffiliateUrl("https://ihg.hmxg.net/5kaEq9"))
        assertTrue(svc.isValidAffiliateUrl("https://marriott.pxf.io/en1QGZ"))
    }

    @Test
    fun `subdomains of an allowed domain are allowed`() {
        assertTrue(service().isValidAffiliateUrl("https://book.marriott.pxf.io/path"))
    }

    @Test
    fun `non-allowlisted and unsafe links are rejected`() {
        val svc = service()
        assertFalse(svc.isValidAffiliateUrl("https://evil.example.com"))
        assertFalse(svc.isValidAffiliateUrl("https://marriott.pxf.io.evil.com")) // not a real subdomain
        assertFalse(svc.isValidAffiliateUrl("javascript:alert(1)"))
        assertFalse(svc.isValidAffiliateUrl(null))
        assertFalse(svc.isValidAffiliateUrl("hyatt.jewn.net")) // no scheme
    }

    @Test
    fun `remotely-synced domains extend the allowlist`() {
        every { prefs.getString(any(), null) } returns """["expedia.com"]"""
        val svc = service()
        assertTrue(svc.isValidAffiliateUrl("https://expedia.com/hotel/123"))
        assertTrue(svc.isValidAffiliateUrl("https://www.expedia.com/x"))
    }

    @Test
    fun `hostOf normalizes scheme and www`() {
        val svc = service()
        assertTrue(svc.hostOf("https://www.Hyatt.jewn.net/x") == "hyatt.jewn.net")
        assertTrue(svc.hostOf("ftp://x.com") == null)
    }
}
