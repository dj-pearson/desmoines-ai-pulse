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

    /**
     * Whether the notification priming card has been answered, either way.
     *
     * Needed because the system POST_NOTIFICATIONS dialog can only be shown a
     * couple of times before Android stops presenting it - so a priming card
     * that reappeared on every launch would burn the real prompt as well as
     * being irritating. Declining is a durable answer, not a "not now".
     */
    private val notificationPrimingKey = booleanPreferencesKey("notification_priming_answered")

    val hasCompletedOnboarding: Flow<Boolean> = context.dataStore.data
        .map { preferences -> preferences[hasCompletedKey] ?: false }

    suspend fun setOnboardingCompleted() {
        context.dataStore.edit { preferences ->
            preferences[hasCompletedKey] = true
        }
    }

    val hasAnsweredNotificationPriming: Flow<Boolean> = context.dataStore.data
        .map { preferences -> preferences[notificationPrimingKey] ?: false }

    suspend fun setNotificationPrimingAnswered() {
        context.dataStore.edit { preferences ->
            preferences[notificationPrimingKey] = true
        }
    }

    suspend fun resetOnboarding() {
        context.dataStore.edit { preferences ->
            preferences[hasCompletedKey] = false
        }
    }
}
