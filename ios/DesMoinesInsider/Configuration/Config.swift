import Foundation

/// Central configuration for the Des Moines Insider iOS app.
///
/// Credentials are resolved in this order:
///   1. `GeneratedSecrets` (written by `scripts/generate-secrets.sh` at build time)
///   2. Info.plist build-setting substitution (`$(SUPABASE_URL)`)
///   3. If both are empty the app displays a configuration-error screen instead of crashing.
enum Config {
    // MARK: - Supabase

    /// Resolved Supabase project URL, or `nil` when credentials are missing.
    static let supabaseURL: URL? = {
        // 1. Generated secrets (most reliable — avoids xcconfig :// comment bug)
        if !GeneratedSecrets.supabaseURL.isEmpty,
           let url = URL(string: GeneratedSecrets.supabaseURL) {
            return url
        }
        // 2. Fallback: Info.plist build-setting substitution
        if let plistValue = Bundle.main.infoDictionary?["SUPABASE_URL"] as? String,
           !plistValue.isEmpty,
           !plistValue.hasPrefix("$("),        // still a build-setting variable reference
           let url = URL(string: plistValue) {
            return url
        }
        return nil
    }()

    /// Resolved Supabase anonymous key, or `nil` when credentials are missing.
    static let supabaseAnonKey: String? = {
        // 1. Generated secrets
        if !GeneratedSecrets.supabaseAnonKey.isEmpty {
            return GeneratedSecrets.supabaseAnonKey
        }
        // 2. Fallback: Info.plist
        if let plistValue = Bundle.main.infoDictionary?["SUPABASE_ANON_KEY"] as? String,
           !plistValue.isEmpty,
           !plistValue.hasPrefix("$(") {
            return plistValue
        }
        return nil
    }()

    /// `true` when both Supabase credentials are present and valid.
    static var isConfigured: Bool {
        supabaseURL != nil && supabaseAnonKey != nil
    }

    // MARK: - App

    static let appName = "Des Moines Insider"
    static let appBundleId = "com.desmoines.aipulse"
    static let siteURL = URL(string: "https://desmoinesinsider.com")!
    static let supportEmail = "support@desmoinesinsider.com"

    // MARK: - Defaults

    /// Des Moines, Iowa center coordinates
    static let defaultLatitude = 41.5868
    static let defaultLongitude = -93.625
    static let defaultSearchRadiusMiles = 30.0

    // MARK: - Pagination

    static let defaultPageSize = 30
    static let maxPageSize = 100

    // MARK: - Cache

    static let cacheExpirationMinutes = 5

    // MARK: - Feature Flags

    static let enableAIFeatures = true
    static let enablePushNotifications = false

    /// Hard-block (cancel) Supabase connections whose TLS chain doesn't match a
    /// pinned SPKI hash, in Release builds. Default `false`: pinning is still
    /// ACTIVE and mismatches are logged, but connections are allowed so a stale
    /// pin can never brick production. Flip to `true` ONLY after verifying the
    /// pinned hashes in CertificatePinningService against the live Supabase host
    /// (see the openssl command in that file). DEBUG builds are always
    /// report-only regardless of this flag.
    static let enforceCertificatePinning = false

    // MARK: - Testing

    /// `true` when the app is launched by XCUITest (Fastlane Snapshot, etc.).
    static let isUITesting: Bool = ProcessInfo.processInfo.arguments.contains("--uitesting")
}
