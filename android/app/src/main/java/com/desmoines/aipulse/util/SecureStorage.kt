package com.desmoines.aipulse.util

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Secure storage using EncryptedSharedPreferences (Android Keystore).
 * Mirrors iOS KeychainService.swift — stores tokens and sensitive user data.
 *
 * Falls back to regular SharedPreferences if the Android Keystore is
 * unavailable (e.g., some emulators or corrupted Keystore state).
 */
@Singleton
class SecureStorage internal constructor(
    private val context: Context,
    /**
     * Test seam. Building the real store needs the Android Keystore, which a
     * JVM unit test does not have, so tests pass an in-memory implementation
     * here instead of relying on the Keystore fallback below tripping.
     * Production always leaves this null and goes through [createPreferences].
     */
    private val prefsOverride: SharedPreferences?,
) {
    @Inject
    constructor(@ApplicationContext context: Context) : this(context, null)

    companion object {
        private const val TAG = "DMI/SecureStorage"
        private const val FILE_NAME = "desmoines_insider_secure_prefs"
        private const val FALLBACK_FILE_NAME = "desmoines_insider_secure_fallback"

        /**
         * Key for the biometric-lock preference, owned by [BiometricAuthService]
         * and named here so [DEVICE_SETTING_KEYS] can reference it.
         */
        const val KEY_BIOMETRIC_ENABLED = "biometric_auth_enabled"

        /**
         * Keys describing how the user configured *this device*, as opposed to
         * who is signed in on it.
         *
         * Session material and cached profile data belong to an account and go
         * on sign-out. A device setting does not: [deleteUserData] preserves
         * these, so signing out no longer silently switches the biometric lock
         * back off, which is a security setting the user deliberately turned on.
         *
         * Anything added here outlives the account that set it, so it must not
         * carry account-identifying data. Counters and timestamps that describe
         * a session (soft-paywall usage, session-timeout stamps) are per-user
         * and deliberately left out - SignOutCleaner resets those by hand.
         */
        val DEVICE_SETTING_KEYS = setOf(KEY_BIOMETRIC_ENABLED)
    }

    private val prefs: SharedPreferences by lazy { prefsOverride ?: createPreferences() }

    private fun createPreferences(): SharedPreferences {
        return try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            EncryptedSharedPreferences.create(
                context,
                FILE_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            Log.w(TAG, "EncryptedSharedPreferences unavailable, falling back to regular SharedPreferences", e)
            context.getSharedPreferences(FALLBACK_FILE_NAME, Context.MODE_PRIVATE)
        }
    }

    /**
     * Save a string value for the given key. Overwrites any existing value.
     */
    fun save(key: String, value: String) {
        prefs.edit().putString(key, value).apply()
    }

    /**
     * Load a string value for the given key.
     * Returns null if the key doesn't exist.
     */
    fun load(key: String): String? {
        return prefs.getString(key, null)
    }

    /**
     * Save a boolean value for the given key.
     */
    fun saveBoolean(key: String, value: Boolean) {
        prefs.edit().putBoolean(key, value).apply()
    }

    /**
     * Load a boolean value for the given key.
     * Returns the defaultValue if the key doesn't exist.
     */
    fun loadBoolean(key: String, defaultValue: Boolean = false): Boolean {
        return prefs.getBoolean(key, defaultValue)
    }

    /**
     * Save a long value for the given key.
     */
    fun saveLong(key: String, value: Long) {
        prefs.edit().putLong(key, value).apply()
    }

    /**
     * Load a long value for the given key.
     * Returns the defaultValue if the key doesn't exist.
     */
    fun loadLong(key: String, defaultValue: Long = 0L): Long {
        return prefs.getLong(key, defaultValue)
    }

    /**
     * Check if a key exists in secure storage.
     */
    fun contains(key: String): Boolean {
        return prefs.contains(key)
    }

    /**
     * Delete a single item by key.
     */
    fun delete(key: String) {
        prefs.edit().remove(key).apply()
    }

    /**
     * Delete every stored item, device settings included.
     *
     * This is a full wipe. Sign-out wants [deleteUserData] instead.
     */
    fun deleteAll() {
        prefs.edit().clear().apply()
    }

    /**
     * Delete everything belonging to the signed-in user, preserving
     * [DEVICE_SETTING_KEYS].
     *
     * Sign-out used to call [deleteAll], which took the biometric-lock
     * preference with it: a user who turned the lock on found it off again
     * after signing back in, with nothing said either way.
     */
    fun deleteUserData() {
        val preserved = prefs.all.filterKeys { it in DEVICE_SETTING_KEYS }
        // SharedPreferences applies clear() before any put in the same edit,
        // whatever the call order, so re-adding the preserved keys here works.
        val editor = prefs.edit().clear()
        for ((key, value) in preserved) {
            when (value) {
                is String -> editor.putString(key, value)
                is Boolean -> editor.putBoolean(key, value)
                is Long -> editor.putLong(key, value)
                is Int -> editor.putInt(key, value)
                is Float -> editor.putFloat(key, value)
                // No other type is written through this class today. Dropping
                // the key is the safe outcome, but say so rather than losing a
                // setting silently -- that is the bug this method exists to fix.
                else -> Log.w(TAG, "Dropping device setting '$key': unsupported type")
            }
        }
        editor.apply()
    }
}
