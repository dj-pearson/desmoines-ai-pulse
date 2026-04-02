package com.desmoines.aipulse.util

import dagger.hilt.android.qualifiers.ApplicationContext
import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages user consent state for data collection (GDPR compliance).
 * Mirrors iOS ConsentService.swift — stores consent per data type securely.
 *
 * Non-EU users skip the consent screen (locale detection).
 * Consent changes are logged for audit trail.
 */
@Singleton
class ConsentService @Inject constructor(
    private val secureStorage: SecureStorage,
) {

    companion object {
        private const val KEY_HAS_COMPLETED = "gdpr_consent_completed"
        private const val KEY_LOCATION = "gdpr_consent_location"
        private const val KEY_EMAIL = "gdpr_consent_email"
        private const val KEY_ANALYTICS = "gdpr_consent_analytics"

        /**
         * EU member states + EEA + UK country codes (ISO 3166-1 alpha-2).
         */
        private val EU_COUNTRIES = setOf(
            "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
            "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
            "PL", "PT", "RO", "SK", "SI", "ES", "SE",
            // EEA + UK
            "IS", "LI", "NO", "GB", "CH",
        )
    }

    // Observable state flows for UI reactivity
    private val _locationConsent = MutableStateFlow(secureStorage.loadBoolean(KEY_LOCATION))
    val locationConsent: StateFlow<Boolean> = _locationConsent.asStateFlow()

    private val _emailConsent = MutableStateFlow(secureStorage.loadBoolean(KEY_EMAIL))
    val emailConsent: StateFlow<Boolean> = _emailConsent.asStateFlow()

    private val _analyticsConsent = MutableStateFlow(secureStorage.loadBoolean(KEY_ANALYTICS))
    val analyticsConsent: StateFlow<Boolean> = _analyticsConsent.asStateFlow()

    /**
     * Whether the user has completed the consent flow (shown only once).
     */
    val hasCompletedConsent: Boolean
        get() = secureStorage.loadBoolean(KEY_HAS_COMPLETED)

    /**
     * Whether the device locale suggests EU residency.
     */
    val isLikelyEU: Boolean
        get() {
            val country = Locale.getDefault().country.uppercase()
            return EU_COUNTRIES.contains(country)
        }

    /**
     * Whether the consent prompt needs to be shown (EU users who haven't completed it).
     */
    val needsConsentPrompt: Boolean
        get() = isLikelyEU && !hasCompletedConsent

    // MARK: - Setters

    fun setLocationConsent(enabled: Boolean) {
        secureStorage.saveBoolean(KEY_LOCATION, enabled)
        _locationConsent.value = enabled
        AppLogger.general.info("Consent changed: location=$enabled")
    }

    fun setEmailConsent(enabled: Boolean) {
        secureStorage.saveBoolean(KEY_EMAIL, enabled)
        _emailConsent.value = enabled
        AppLogger.general.info("Consent changed: email=$enabled")
    }

    fun setAnalyticsConsent(enabled: Boolean) {
        secureStorage.saveBoolean(KEY_ANALYTICS, enabled)
        _analyticsConsent.value = enabled
        AppLogger.general.info("Consent changed: analytics=$enabled")
    }

    // MARK: - Bulk Actions

    /**
     * Accept all consent types and mark flow as completed.
     */
    fun acceptAll() {
        setLocationConsent(true)
        setEmailConsent(true)
        setAnalyticsConsent(true)
        secureStorage.saveBoolean(KEY_HAS_COMPLETED, true)
        AppLogger.general.info("GDPR consent: accepted all")
    }

    /**
     * Save current selections and mark flow as completed.
     */
    fun saveAndComplete() {
        secureStorage.saveBoolean(KEY_HAS_COMPLETED, true)
        AppLogger.general.info(
            "GDPR consent flow completed: location=${_locationConsent.value}, " +
            "email=${_emailConsent.value}, analytics=${_analyticsConsent.value}"
        )
    }

    /**
     * Revoke all consent types.
     */
    fun revokeAll() {
        setLocationConsent(false)
        setEmailConsent(false)
        setAnalyticsConsent(false)
        AppLogger.general.info("GDPR consent: all revoked")
    }
}
