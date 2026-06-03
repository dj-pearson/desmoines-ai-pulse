import Foundation

// MARK: - IOS-ADS-012 · Frequency-capped interstitial gate
//
// Decides whether a full-screen interstitial may appear at a major navigation
// boundary. Conservative by construction:
//   • free tier only (checked by the caller)
//   • at most `AdConfig.interstitialMaxPerSession` per app session
//   • never during the first `interstitialMinSessionsBeforeFirst` sessions
//     (so never on first launch / onboarding)
//   • only every Nth qualifying boundary, and never within
//     `interstitialMinInterval` of the last one
//
// "Never mid-task" is upheld by the caller only asking at a settled boundary
// (e.g. a tab switch), never while the user is reading or in a flow.
@MainActor
final class InterstitialAdService {
    static let shared = InterstitialAdService()
    private init() {}

    private let defaults = UserDefaults.standard
    private let sessionCountKey = "interstitial.sessionCount"
    private let lastShownKey = "interstitial.lastShownAt"

    private var shownThisSession = 0
    private var boundaryCount = 0
    private var sessionCounted = false

    /// Call once per app foreground session (e.g. from `MainTabView.onAppear`).
    func noteSessionStart() {
        guard !sessionCounted else { return }
        sessionCounted = true
        shownThisSession = 0
        boundaryCount = 0
        defaults.set(defaults.integer(forKey: sessionCountKey) + 1, forKey: sessionCountKey)
    }

    /// Returns true if an interstitial may be shown at this boundary. The caller
    /// is responsible for the free-tier check and for presenting + calling
    /// `markPresented()`.
    func shouldPresentAtBoundary() -> Bool {
        guard !Config.isUITesting else { return false }
        boundaryCount += 1
        guard shownThisSession < AdConfig.interstitialMaxPerSession else { return false }
        guard defaults.integer(forKey: sessionCountKey) > AdConfig.interstitialMinSessionsBeforeFirst else { return false }
        guard boundaryCount % AdConfig.interstitialBoundaryInterval == 0 else { return false }
        if let last = defaults.object(forKey: lastShownKey) as? Date,
           Date().timeIntervalSince(last) < AdConfig.interstitialMinInterval {
            return false
        }
        return true
    }

    func markPresented() {
        shownThisSession += 1
        defaults.set(Date(), forKey: lastShownKey)
    }
}
