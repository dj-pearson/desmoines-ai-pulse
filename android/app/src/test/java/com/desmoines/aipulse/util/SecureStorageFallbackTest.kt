package com.desmoines.aipulse.util

import android.content.Context
import android.content.SharedPreferences
import io.mockk.every
import io.mockk.mockk
import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.security.KeyStoreException

/**
 * A Keystore failure has to leave a trace (AND-AUDIT-008).
 *
 * createPreferences() caught every exception from EncryptedSharedPreferences and
 * returned an ordinary unencrypted SharedPreferences with a Log.w. On a release
 * build that log reaches nobody, so from that point on everything the app called
 * secure was in cleartext and nothing recorded it.
 *
 * The real path cannot be driven from a JVM test - EncryptedSharedPreferences
 * needs the Android Keystore, so it neither succeeds nor fails here. These go
 * through the encryptedPrefsFactory seam, which is the same code path production
 * takes, differing only in what builds the store.
 */
class SecureStorageFallbackTest {

    @TempDir
    lateinit var crashDir: File

    private val fallbackPrefs = FakeSharedPreferences()

    private fun crashReporting() =
        CrashReportingService(File(crashDir, "CrashReports"), Json { ignoreUnknownKeys = true })

    private fun context(): Context = mockk(relaxed = true) {
        every { getSharedPreferences(any(), any()) } returns fallbackPrefs
    }

    /** Touch the lazy store so createPreferences() actually runs. */
    private fun SecureStorage.materialize() = load("anything")

    @Test
    fun `a Keystore failure is reported, not just logged`() {
        val reporting = crashReporting()
        val boom = KeyStoreException("keystore is toast")

        SecureStorage(context(), null, reporting, { throw boom }).materialize()

        val records = reporting.pendingRecords()
        assertEquals(1, records.size, "the fallback must produce exactly one report")
        val record = records.single()
        assertEquals(SecureStorageFallbackException::class.java.name, record.type)
        assertEquals(false, record.fatal)
        assertEquals("plaintext-fallback", record.context["effect"])
        assertEquals(KeyStoreException::class.java.name, record.context["cause"])
        assertTrue(
            record.stackTrace.contains("keystore is toast"),
            "the original failure must survive as the cause, or the report cannot be diagnosed",
        )
    }

    @Test
    fun `the report names the device settings the fallback silently resets`() {
        // The fallback is a different file, so it starts empty: a Keystore
        // failure also turns the biometric lock back off with no prompt. That
        // consequence is the reason this report exists, so it has to be in it.
        val reporting = crashReporting()
        SecureStorage(context(), null, reporting, { throw KeyStoreException("x") }).materialize()

        val lost = reporting.pendingRecords().single().context["deviceSettingsLost"]
        assertNotNull(lost)
        assertTrue(
            lost!!.contains(SecureStorage.KEY_BIOMETRIC_ENABLED),
            "biometric_auth_enabled is lost on fallback and the report must say so",
        )
    }

    @Test
    fun `NEGATIVE CONTROL - a healthy Keystore reports nothing`() {
        // Without this the first test would still pass if the code reported on
        // every construction rather than only on failure.
        val reporting = crashReporting()
        val healthy: (Context) -> SharedPreferences = { FakeSharedPreferences() }

        SecureStorage(context(), null, reporting, healthy).materialize()

        assertTrue(
            reporting.pendingRecords().isEmpty(),
            "a working encrypted store must produce no crash records",
        )
    }

    @Test
    fun `storage still works after the fallback`() {
        // Failing closed would lock users out on a Keystore corrupted by an OEM
        // update, which is the common trigger - so the fallback stays, and the
        // app must keep functioning through it. AC2's decision, made explicit.
        val storage = SecureStorage(context(), null, crashReporting(), { throw KeyStoreException("x") })

        storage.save("access_token", "written-in-the-clear")

        assertEquals("written-in-the-clear", storage.load("access_token"))
    }

    @Test
    fun `a broken crash reporter cannot break storage`() {
        // Reporting a downgrade must never be able to lock the user out.
        val exploding: CrashReportingService = mockk()
        every { exploding.recordError(any(), any()) } throws IllegalStateException("reporter down")

        val storage = SecureStorage(context(), null, exploding, { throw KeyStoreException("x") })

        storage.save("k", "v")
        assertEquals("v", storage.load("k"))
    }
}
