package com.desmoines.aipulse.util

import android.content.SharedPreferences

/**
 * In-memory [SharedPreferences] for unit tests.
 *
 * SecureStorage's whole job is what survives a wipe and what does not, and a
 * mock that records calls cannot answer that -- it would pass whatever the
 * implementation happened to do. This keeps real values in a map so the test
 * can read them back after the wipe.
 */
class FakeSharedPreferences(initial: Map<String, Any> = emptyMap()) : SharedPreferences {

    private val values = LinkedHashMap<String, Any>(initial)

    override fun getAll(): MutableMap<String, *> = LinkedHashMap(values)

    override fun getString(key: String?, defValue: String?): String? =
        values[key] as? String ?: defValue

    @Suppress("UNCHECKED_CAST")
    override fun getStringSet(key: String?, defValues: MutableSet<String>?): MutableSet<String>? =
        values[key] as? MutableSet<String> ?: defValues

    override fun getInt(key: String?, defValue: Int): Int = values[key] as? Int ?: defValue

    override fun getLong(key: String?, defValue: Long): Long = values[key] as? Long ?: defValue

    override fun getFloat(key: String?, defValue: Float): Float = values[key] as? Float ?: defValue

    override fun getBoolean(key: String?, defValue: Boolean): Boolean =
        values[key] as? Boolean ?: defValue

    override fun contains(key: String?): Boolean = values.containsKey(key)

    override fun edit(): SharedPreferences.Editor = FakeEditor()

    override fun registerOnSharedPreferenceChangeListener(
        listener: SharedPreferences.OnSharedPreferenceChangeListener?,
    ) = Unit

    override fun unregisterOnSharedPreferenceChangeListener(
        listener: SharedPreferences.OnSharedPreferenceChangeListener?,
    ) = Unit

    private inner class FakeEditor : SharedPreferences.Editor {
        private val pending = LinkedHashMap<String, Any?>()
        private val removals = mutableSetOf<String>()
        private var clearRequested = false

        override fun putString(key: String, value: String?) = set(key, value)
        override fun putStringSet(key: String, value: MutableSet<String>?) = set(key, value)
        override fun putInt(key: String, value: Int) = set(key, value)
        override fun putLong(key: String, value: Long) = set(key, value)
        override fun putFloat(key: String, value: Float) = set(key, value)
        override fun putBoolean(key: String, value: Boolean) = set(key, value)

        override fun remove(key: String): SharedPreferences.Editor {
            removals += key
            return this
        }

        override fun clear(): SharedPreferences.Editor {
            clearRequested = true
            return this
        }

        override fun commit(): Boolean {
            apply()
            return true
        }

        // Real SharedPreferences applies clear() before any put in the same
        // edit, whatever order they were called in. deleteUserData relies on
        // exactly that to re-add the preserved keys, so the fake has to match.
        override fun apply() {
            if (clearRequested) values.clear()
            removals.forEach { values.remove(it) }
            pending.forEach { (key, value) ->
                if (value == null) values.remove(key) else values[key] = value
            }
        }

        private fun set(key: String, value: Any?): SharedPreferences.Editor {
            pending[key] = value
            return this
        }
    }
}
