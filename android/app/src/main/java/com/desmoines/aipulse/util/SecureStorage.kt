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
class SecureStorage @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private const val TAG = "DMI/SecureStorage"
        private const val FILE_NAME = "desmoines_insider_secure_prefs"
        private const val FALLBACK_FILE_NAME = "desmoines_insider_secure_fallback"
    }

    private val prefs: SharedPreferences by lazy { createPreferences() }

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
     * Delete all stored items. Call on logout.
     */
    fun deleteAll() {
        prefs.edit().clear().apply()
    }
}
