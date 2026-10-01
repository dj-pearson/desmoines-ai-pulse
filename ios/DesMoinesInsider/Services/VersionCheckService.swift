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

    /// App Store URL to send the user to when an upgrade is required. Starts
    /// at the App Store page (the website while Config.appStoreId is the
    /// sentinel) so the blocking screen always has a way out, even when the
    /// server sends no storeUrl (IOS-DD-PLATFORM-09).
    private(set) var storeURL: URL? = Config.appStoreURL

    /// Copy for the blocking screen, supplied by the server.
    private(set) var message = "Please update to the latest version to continue."

    /// Latest available version, when the server reports an optional update.
    private(set) var latestVersion: String?

    private let supabase = SupabaseService.shared.client

    /// When the last check ran, for the foreground re-check.
    private var lastCheckedAt: Date?

    private init() {}

    /// The server's storeUrl, only when it is https on Apple's store or our
    /// own site. It is opened from a screen the user cannot leave, so an
    /// itms-services:// or look-alike host is dropped (IOS-DD-PLATFORM-09).
    nonisolated static func acceptedStoreURL(_ string: String?) -> URL? {
        guard let string, let url = URL(string: string),
              url.scheme?.lowercased() == "https",
              let host = url.host?.lowercased(),
              ["apps.apple.com", "itunes.apple.com", "desmoinesinsider.com", "www.desmoinesinsider.com"].contains(host),
              // The unassigned-id sentinel is a dead App Store page; keep the
              // website instead (Config.appStoreId, IOS-DD-PLATFORM-21).
              !url.path.hasSuffix("id" + Config.appStoreIdPlaceholder)
        else { return nil }
        return url
    }

    /// Re-runs the check when the last one is older than `interval`, so a
    /// process that lives for days still meets a newly raised floor.
    func checkIfStale(interval: TimeInterval = 6 * 3600) async {
        if let lastCheckedAt, Date().timeIntervalSince(lastCheckedAt) < interval { return }
        await checkOnLaunch()
    }

    /// Only `forceUpgrade` is required — it is the load-bearing field that gates
    /// the blocking screen. Every other field is optional with a sensible
    /// default so that a null/omitted peripheral field (e.g. `latestVersion`)
    /// can never throw during decode and silently drop a legitimate
    /// `forceUpgrade: true`, which would defeat the whole retire-old-binary
    /// mechanism (IOS-AUDIT-REL-001).
    struct Response: Decodable {
        let platform: String?
        let currentVersion: String?
        let minSupportedVersion: String?
        let latestVersion: String?
        let forceUpgrade: Bool
        let updateAvailable: Bool?
        let storeUrl: String?
        let message: String?
    }

    private struct Payload: Encodable {
        let platform: String
        let version: String
    }

    /// Performs the launch check. Safe to call unauthenticated; no-ops under UI
    /// tests so screenshots/automation never hit the gate.
    func checkOnLaunch() async {
        guard !Config.isUITesting, let client = supabase else { return }
        lastCheckedAt = Date()

        do {
            let response: Response = try await client.functions.invoke(
                "version-check",
                options: .init(body: Payload(platform: "ios", version: Config.appVersion))
            )
            forceUpgrade = response.forceUpgrade
            // Only overwrite the App Store URL when the server actually supplied a
            // valid one, so a null/blank `storeUrl` never nils out the only escape
            // route on the blocking screen. ForceUpdateView also guards nil.
            if let url = Self.acceptedStoreURL(response.storeUrl) {
                storeURL = url
            }
            if let serverMessage = response.message, !serverMessage.isEmpty {
                message = serverMessage
            }
            latestVersion = (response.updateAvailable ?? false) ? response.latestVersion : nil
            #if DEBUG
            AppLogger.network.info(
                "version-check: \(Config.appVersion) min=\(response.minSupportedVersion ?? "?") force=\(response.forceUpgrade)"
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
