import Foundation

// MARK: - IOS-SUB-013 · Post-onboarding soft paywall
//
// Decides whether to re-surface a soft (skippable) upsell after onboarding,
// based on an engagement threshold and a frequency cap so it never nags:
//
//   • only for free users who have finished onboarding
//   • at most once per `cooldownDays`, and `maxPresentations` times ever
//   • triggered by engagement (N favorites today; first Trip Planner attempt)
//
// When it decides to present, it posts `.softPaywallTriggered` (with a `source`
// + the PaywallContext id) so the single MainTabView presenter shows it —
// matching the favorites-cap pattern, one presenter, no per-call-site sheets.
//
// IOS-DD-MONETIZATION-13: the cap used to be recorded when the request was
// POSTED. A request made from inside a sheet (Trip Planner is presented as
// one from Home and Dashboard) never reached the root presenter, yet burned
// the cap, and the Trip Planner then treated the paywall as shown and did
// nothing. The cap is now recorded by `recordPresentation` from the sheet's
// onAppear, and the Trip Planner shows its own paywall.
@MainActor
final class SoftPaywallService {
    static let shared = SoftPaywallService()
    private init() {}

    // Tuning
    private let favoritesThreshold = 2     // after the user's 2nd save
    private let cooldownDays = 7
    private let maxPresentations = 3

    private static let lastShownKey = "softPaywall.lastShownAt"
    private static let countKey = "softPaywall.presentCount"
    private var lastShownKey: String { Self.lastShownKey }
    private var countKey: String { Self.countKey }

    /// Call after a free user successfully saves a favorite. Presents the
    /// progress nudge ("2 of 3 free saves"), which is true below the cap.
    func considerAfterFavorite(totalFavorites: Int) {
        guard totalFavorites >= favoritesThreshold else { return }
        present(source: "favorites", contextId: "favorites_soft", extra: ["used": totalFavorites])
    }

    /// Analytics only: a free user tried the AI Trip Planner. The planner
    /// presents its own paywall, from inside its own sheet.
    func noteTripPlannerAttempt() {
        AnalyticsService.shared.trackSoftPaywall(source: "trip_planner")
    }

    /// Called when a soft paywall is actually on screen. This is what starts
    /// the cooldown and counts toward the lifetime cap.
    func recordPresentation(source: String) {
        let defaults = UserDefaults.standard
        defaults.set(Date(), forKey: lastShownKey)
        defaults.set(defaults.integer(forKey: countKey) + 1, forKey: countKey)
        AnalyticsService.shared.trackSoftPaywall(source: source)
    }

    /// Records that the onboarding trial moment was shown, so the post-onboarding
    /// soft paywall starts its cooldown from there and doesn't double-upsell in
    /// the same first session.
    func noteOnboardingUpsellShown() {
        UserDefaults.standard.set(Date(), forKey: lastShownKey)
    }

    // MARK: - Internals

    /// Checks eligibility and posts. Records nothing: see recordPresentation.
    private func present(source: String, contextId: String, extra: [String: Any] = [:]) {
        guard isEligible() else { return }
        var info: [String: Any] = ["context": contextId, "source": source]
        info.merge(extra) { _, new in new }
        NotificationCenter.default.post(
            name: .softPaywallTriggered,
            object: nil,
            userInfo: info
        )
    }

    /// Gates: onboarding done, still free, under the lifetime cap, past cooldown.
    func isEligible(
        defaults: UserDefaults = .standard,
        isFree: Bool? = nil,
        now: Date = Date()
    ) -> Bool {
        guard defaults.bool(forKey: "hasCompletedOnboarding") else { return false }
        guard isFree ?? (StoreKitService.shared.currentTier == .free) else { return false }
        guard defaults.integer(forKey: Self.countKey) < maxPresentations else { return false }
        if let last = defaults.object(forKey: Self.lastShownKey) as? Date,
           now.timeIntervalSince(last) < Double(cooldownDays) * 86_400 {
            return false
        }
        return true
    }
}

extension Notification.Name {
    /// Posted by SoftPaywallService when a post-onboarding soft upsell should
    /// appear. `userInfo["context"]` carries the PaywallContext id to present.
    static let softPaywallTriggered = Notification.Name("softPaywallTriggered")
}
