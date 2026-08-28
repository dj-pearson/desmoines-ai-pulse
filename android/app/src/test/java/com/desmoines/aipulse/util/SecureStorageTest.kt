package com.desmoines.aipulse.util

import android.content.Context
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Covers what a sign-out wipe keeps and what it takes (AND-AUDIT-024).
 *
 * The real store is built on the Android Keystore, which a JVM unit test does
 * not have, so these go through SecureStorage's test seam with an in-memory
 * [FakeSharedPreferences]. The Context is only there for [createPreferences],
 * which the seam bypasses.
 */
class SecureStorageTest {

    private val prefs = FakeSharedPreferences()
    private val context: Context = mockk(relaxed = true)
    private val storage = SecureStorage(context, prefs)

    @Test
    fun `deleteUserData keeps the biometric lock and drops everything else`() {
        storage.save(SecureStorage.KEY_BIOMETRIC_ENABLED, "true")
        storage.save("access_token", "secret-value")
        storage.save("cached_profile", "{}")
        storage.saveLong("session_started_at", 1_700_000_000_000L)
        storage.saveBoolean("soft_paywall_shown", true)

        storage.deleteUserData()

        // The setting the user turned on deliberately. Sign-out used to clear
        // it, so a security choice quietly reverted itself.
        assertEquals("true", storage.load(SecureStorage.KEY_BIOMETRIC_ENABLED))

        // Everything tied to the account that just signed out.
        assertNull(storage.load("access_token"))
        assertNull(storage.load("cached_profile"))
        assertFalse(storage.contains("session_started_at"))
        assertFalse(storage.contains("soft_paywall_shown"))
    }

    @Test
    fun `deleteUserData leaves an unset device setting unset`() {
        storage.save("access_token", "secret-value")

        storage.deleteUserData()

        assertFalse(storage.contains(SecureStorage.KEY_BIOMETRIC_ENABLED))
        assertFalse(storage.contains("access_token"))
    }

    @Test
    fun `deleteAll is still a full wipe including device settings`() {
        storage.save(SecureStorage.KEY_BIOMETRIC_ENABLED, "true")
        storage.save("access_token", "secret-value")

        storage.deleteAll()

        assertFalse(storage.contains(SecureStorage.KEY_BIOMETRIC_ENABLED))
        assertFalse(storage.contains("access_token"))
    }

    @Test
    fun `a preserved device setting keeps its stored type`() {
        // DEVICE_SETTING_KEYS holds one string-valued key today, but the
        // restore path switches on the stored type. Pin that before someone
        // adds a boolean or long setting and finds it quietly dropped.
        storage.saveBoolean(SecureStorage.KEY_BIOMETRIC_ENABLED, true)

        storage.deleteUserData()

        assertTrue(storage.loadBoolean(SecureStorage.KEY_BIOMETRIC_ENABLED))
    }
}
