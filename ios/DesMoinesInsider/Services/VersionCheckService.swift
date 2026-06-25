import Foundation
import Observation

/// Launch-time minimum-supported-version gate (IOS-AUDIT-REL-001).
///
/// Calls the `version-check` edge function on launch with the app's
/// `CFBundleShortVersionString`. When the running binary is below the
/// server-defined floor, `forceUpgrade` flips true and the app shell shows a
/// blocking `ForceUpdateView`. This is the client half of the CLAUDE.md
/// force-update flow that lets the backend retire an old binary before shipping
/// a backward-incompatible change.
///
/// Fails open: any network/parse error leaves `forceUpgrade == false` so a
/// backend hiccup can never lock users out of a perfectly-supported build.
@MainActor
@Observable
final class VersionCheckService {
    static let shared = VersionCheckService()

    /// True when the running version is below the server's minimum-supported
    /// floor and the app must block until the user updates.
    private(set) var forceUpgrade = false

    /// App Store URL to send the user to when an upgrade is required.
    private(set) var storeURL: URL?

    /// Copy for the blocking screen, supplied by the server.
    private(set) var message = "Please update to the latest version to continue."

    /// Latest available version, when the server reports an optional update.
    private(set) var latestVersion: String?

    private let supabase = SupabaseService.shared.client

    private init() {}

    struct Response: Decodable {
        let platform: String
        let currentVersion: String
        let minSupportedVersion: String
        let latestVersion: String
        let forceUpgrade: Bool
        let updateAvailable: Bool
        let storeUrl: String
        let message: String
    }

    private struct Payload: Encodable {
        let platform: String
        let version: String
    }

    /// Performs the launch check. Safe to call unauthenticated; no-ops under UI
    /// tests so screenshots/automation never hit the gate.
    func checkOnLaunch() async {
        guard !Config.isUITesting, let client = supabase else { return }

        do {
            let response: Response = try await client.functions.invoke(
                "version-check",
                options: .init(body: Payload(platform: "ios", version: Config.appVersion))
            )
            forceUpgrade = response.forceUpgrade
            storeURL = URL(string: response.storeUrl)
            message = response.message
            latestVersion = response.updateAvailable ? response.latestVersion : nil
            #if DEBUG
            AppLogger.network.info(
                "version-check: \(Config.appVersion) min=\(response.minSupportedVersion) force=\(response.forceUpgrade)"
            )
            #endif
        } catch {
            // Fail open — never block a supported build because the check failed.
            #if DEBUG
            AppLogger.network.warning("version-check failed (failing open): \(error.localizedDescription)")
            #endif
        }
    }
}
