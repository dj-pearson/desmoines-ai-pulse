package com.desmoines.aipulse.util

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "onboarding")

/**
 * Manages onboarding completion state using Jetpack DataStore.
 * Replaces iOS UserDefaults hasCompletedOnboarding flag.
 */
@Singleton
class OnboardingPreferences @Inject constructor(
    @param:ApplicationContext private val context: Context
) {
    private val hasCompletedKey = booleanPreferencesKey("has_completed_onboarding")

    val hasCompletedOnboarding: Flow<Boolean> = context.dataStore.data
        .map { preferences -> preferences[hasCompletedKey] ?: false }

    suspend fun setOnboardingCompleted() {
        context.dataStore.edit { preferences ->
            preferences[hasCompletedKey] = true
        }
    }

    suspend fun resetOnboarding() {
        context.dataStore.edit { preferences ->
            preferences[hasCompletedKey] = false
        }
    }
}
