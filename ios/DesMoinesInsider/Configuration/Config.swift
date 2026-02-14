import Foundation

/// Central configuration for the Des Moines Insider iOS app.
/// Reads Supabase credentials from Info.plist (set via xcconfig or build settings).
enum Config {
    // MARK: - Supabase

    static let supabaseURL: URL = {
        guard let urlString = Bundle.main.infoDictionary?["SUPABASE_URL"] as? String,
              let url = URL(string: urlString) else {
            fatalError("SUPABASE_URL not set in Info.plist. Add it to your xcconfig or build settings.")
        }
        return url
    }()

    static let supabaseAnonKey: String = {
        guard let key = Bundle.main.infoDictionary?["SUPABASE_ANON_KEY"] as? String, !key.isEmpty else {
            fatalError("SUPABASE_ANON_KEY not set in Info.plist. Add it to your xcconfig or build settings.")
        }
        return key
    }()

    // MARK: - App

    static let appName = "Des Moines Insider"
    static let appBundleId = "com.desmoinespulse.app"
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
    static let enablePushNotifications = true
}
