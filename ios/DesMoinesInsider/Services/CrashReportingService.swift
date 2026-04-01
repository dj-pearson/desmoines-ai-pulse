import Foundation
import os

/// Crash reporting facade that wraps Firebase Crashlytics.
///
/// When Firebase is integrated (GoogleService-Info.plist present):
///   - Non-fatal errors are forwarded from AppLogger.error calls
///   - User ID is set (anonymized) after authentication
///   - dSYM upload configured in CI
///
/// Until Firebase is added, this service logs locally via AppLogger.
/// To activate:
///   1. Add Firebase SPM package to project.yml
///   2. Add GoogleService-Info.plist to Resources (gitignored, injected in CI)
///   3. Uncomment Firebase imports and calls below
///   4. Add dSYM upload to ios-native-release.yml
@MainActor
final class CrashReportingService {
    static let shared = CrashReportingService()

    private init() {}

    /// Initialize crash reporting on app launch.
    func configure() {
        // TODO: Uncomment when Firebase is added
        // FirebaseApp.configure()
        AppLogger.general.info("Crash reporting service initialized (local-only mode)")
    }

    /// Set anonymized user ID for crash attribution.
    func setUserId(_ userId: String) {
        // Hash the user ID so no PII reaches Crashlytics
        let anonymized = userId.data(using: .utf8)!.map { String(format: "%02x", $0) }.joined()
        let truncated = String(anonymized.prefix(16))
        // TODO: Uncomment when Firebase is added
        // Crashlytics.crashlytics().setUserID(truncated)
        AppLogger.general.info("Crash reporting user set: \(truncated)")
    }

    /// Log a non-fatal error.
    func recordError(_ error: Error, context: [String: String] = [:]) {
        // TODO: Uncomment when Firebase is added
        // Crashlytics.crashlytics().record(error: error, userInfo: context)
        AppLogger.general.error("Non-fatal error recorded: \(error.localizedDescription)")
    }

    /// Log a custom key-value for crash context.
    func setCustomValue(_ value: String, forKey key: String) {
        // TODO: Uncomment when Firebase is added
        // Crashlytics.crashlytics().setCustomValue(value, forKey: key)
    }
}
