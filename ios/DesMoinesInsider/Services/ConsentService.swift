import Foundation
import os

/// Manages user consent state for data collection (GDPR compliance).
///
/// Stores consent per data type securely in UserDefaults.
/// Non-EU users skip the consent screen (locale detection).
@MainActor
@Observable
final class ConsentService {
    static let shared = ConsentService()

    /// Whether the user has completed the consent flow (shown only once).
    var hasCompletedConsent: Bool {
        get { UserDefaults.standard.bool(forKey: Keys.hasCompleted) }
        set { UserDefaults.standard.set(newValue, forKey: Keys.hasCompleted) }
    }

    /// Individual consent toggles
    var locationConsent: Bool {
        get { UserDefaults.standard.bool(forKey: Keys.location) }
        set {
            UserDefaults.standard.set(newValue, forKey: Keys.location)
            AppLogger.general.info("Consent changed: location=\(newValue)")
        }
    }

    var emailConsent: Bool {
        get { UserDefaults.standard.bool(forKey: Keys.email) }
        set {
            UserDefaults.standard.set(newValue, forKey: Keys.email)
            AppLogger.general.info("Consent changed: email=\(newValue)")
        }
    }

    var analyticsConsent: Bool {
        get { UserDefaults.standard.bool(forKey: Keys.analytics) }
        set {
            UserDefaults.standard.set(newValue, forKey: Keys.analytics)
            AppLogger.general.info("Consent changed: analytics=\(newValue)")
        }
    }

    /// Whether the device locale suggests EU residency.
    var isLikelyEU: Bool {
        let euCountries: Set<String> = [
            "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
            "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
            "PL", "PT", "RO", "SK", "SI", "ES", "SE",
            // EEA + UK
            "IS", "LI", "NO", "GB", "CH",
        ]
        let region = Locale.current.region?.identifier ?? ""
        return euCountries.contains(region)
    }

    /// Whether consent is required (EU users who haven't completed it).
    var needsConsentPrompt: Bool {
        isLikelyEU && !hasCompletedConsent
    }

    /// Accept all consent types and mark as completed.
    func acceptAll() {
        locationConsent = true
        emailConsent = true
        analyticsConsent = true
        hasCompletedConsent = true
    }

    /// Save current selections and mark as completed.
    func saveAndComplete() {
        hasCompletedConsent = true
        AppLogger.general.info("Consent flow completed: location=\(self.locationConsent), email=\(self.emailConsent), analytics=\(self.analyticsConsent)")
    }

    /// Revoke all consent.
    func revokeAll() {
        locationConsent = false
        emailConsent = false
        analyticsConsent = false
        AppLogger.general.info("All consent revoked")
    }

    private init() {}

    private enum Keys {
        static let hasCompleted = "gdpr_consent_completed"
        static let location = "gdpr_consent_location"
        static let email = "gdpr_consent_email"
        static let analytics = "gdpr_consent_analytics"
    }
}
