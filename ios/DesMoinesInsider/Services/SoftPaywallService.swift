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
@MainActor
final class SoftPaywallService {
    static let shared = SoftPaywallService()
    private init() {}

    // Tuning
    private let favoritesThreshold = 2     // after the user's 2nd save
    private let cooldownDays = 7
    private let maxPresentations = 3

    private let lastShownKey = "softPaywall.lastShownAt"
    private let countKey = "softPaywall.presentCount"

    /// Call after a free user successfully saves a favorite.
    func considerAfterFavorite(totalFavorites: Int) {
        guard totalFavorites >= favoritesThreshold else { return }
        present(source: "favorites", context: .unlimitedFavorites)
    }

    /// Seam for IOS-PARITY-001: call on the first AI Trip Planner attempt.
    func considerAfterTripPlannerAttempt() {
        present(source: "trip_planner", context: .tripPlanner)
    }

    /// Records that the onboarding trial moment was shown, so the post-onboarding
    /// soft paywall starts its cooldown from there and doesn't double-upsell in
    /// the same first session.
    func noteOnboardingUpsellShown() {
        UserDefaults.standard.set(Date(), forKey: lastShownKey)
    }

    // MARK: - Internals

    private func present(source: String, context: PaywallContext) {
        guard isEligible() else { return }
        let defaults = UserDefaults.standard
        defaults.set(Date(), forKey: lastShownKey)
        defaults.set(defaults.integer(forKey: countKey) + 1, forKey: countKey)
        AnalyticsService.shared.trackSoftPaywall(source: source)
        NotificationCenter.default.post(
            name: .softPaywallTriggered,
            object: nil,
            userInfo: ["context": context.id]
        )
    }

    /// Gates: onboarding done, still free, under the lifetime cap, past cooldown.
    private func isEligible() -> Bool {
        let defaults = UserDefaults.standard
        guard defaults.bool(forKey: "hasCompletedOnboarding") else { return false }
        guard StoreKitService.shared.currentTier == .free else { return false }
        guard defaults.integer(forKey: countKey) < maxPresentations else { return false }
        if let last = defaults.object(forKey: lastShownKey) as? Date,
           Date().timeIntervalSince(last) < Double(cooldownDays) * 86_400 {
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
