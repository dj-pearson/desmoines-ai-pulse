import Foundation
import os

/// Lightweight analytics facade that wraps Firebase Analytics.
///
/// Tracks key user actions anonymously. Respects GDPR consent via ConsentService.
/// When Firebase is integrated, calls Analytics.logEvent(). Until then, logs locally.
///
/// To activate:
///   1. Add Firebase SPM package to project.yml
///   2. Add GoogleService-Info.plist to Resources
///   3. Uncomment Firebase imports and calls below
///   4. Update PrivacyInfo.xcprivacy with analytics data collection
@MainActor
final class AnalyticsService {
    static let shared = AnalyticsService()

    private init() {}

    // MARK: - Screen Views

    func trackScreenView(_ screenName: String) {
        guard ConsentService.shared.analyticsConsent else { return }
        // Analytics.logEvent(AnalyticsEventScreenView, parameters: [AnalyticsParameterScreenName: screenName])
        AppLogger.general.debug("Analytics: screen_view — \(screenName)")
    }

    // MARK: - Events

    func trackEvent(_ name: String, parameters: [String: Any]? = nil) {
        guard ConsentService.shared.analyticsConsent else { return }
        // Analytics.logEvent(name, parameters: parameters)
        AppLogger.general.debug("Analytics: \(name)")
    }

    // MARK: - Pre-defined Events

    func trackAppOpen() {
        trackEvent("app_open")
    }

    func trackViewEvent(eventId: String, category: String?) {
        trackEvent("view_event", parameters: [
            "event_id": eventId,
            "category": category ?? "unknown",
        ])
    }

    func trackViewRestaurant(restaurantId: String, cuisine: String?) {
        trackEvent("view_restaurant", parameters: [
            "restaurant_id": restaurantId,
            "cuisine": cuisine ?? "unknown",
        ])
    }

    func trackSearch(query: String, resultCount: Int) {
        trackEvent("search", parameters: [
            "query_length": query.count,
            "result_count": resultCount,
        ])
    }

    func trackSaveFavorite(itemType: String, itemId: String) {
        trackEvent("save_favorite", parameters: [
            "item_type": itemType,
            "item_id": itemId,
        ])
    }

    func trackSubscriptionView() {
        trackEvent("subscription_view")
    }

    func trackPurchaseStart(productId: String) {
        trackEvent("purchase_start", parameters: ["product_id": productId])
    }

    func trackPurchaseComplete(productId: String) {
        trackEvent("purchase_complete", parameters: ["product_id": productId])
    }

    // MARK: - Contextual Paywall (IOS-SUB-010)
    //
    // Every paywall lifecycle event carries the `context` id (e.g.
    // "unlimited_favorites", "trip_planner") so per-surface conversion can be
    // measured — which upsell moments convert and which don't.

    func trackPaywallPresented(context: String, tier: String) {
        trackEvent("paywall_present", parameters: ["context": context, "tier": tier])
    }

    func trackPaywallDismissed(context: String) {
        trackEvent("paywall_dismiss", parameters: ["context": context])
    }

    func trackPaywallPurchaseStart(context: String, productId: String) {
        trackEvent("paywall_purchase_start", parameters: ["context": context, "product_id": productId])
    }

    func trackPaywallPurchaseComplete(context: String, productId: String) {
        trackEvent("paywall_purchase_complete", parameters: ["context": context, "product_id": productId])
    }

    func trackPaywallRestore(context: String) {
        trackEvent("paywall_restore", parameters: ["context": context])
    }

    // MARK: - Onboarding & soft paywall (IOS-SUB-013)
    //
    // `action`: shown / start_tapped / skipped — for first-session trial funnel.
    // `source`: which engagement threshold fired the post-onboarding soft paywall.

    func trackOnboardingTrial(action: String) {
        trackEvent("onboarding_trial", parameters: ["action": action, "cohort": "onboarding"])
    }

    func trackSoftPaywall(source: String) {
        trackEvent("soft_paywall_present", parameters: ["source": source])
    }

    // MARK: - User Properties

    func setUserId(_ userId: String?) {
        guard ConsentService.shared.analyticsConsent else { return }
        // Anonymize: only first 16 chars of hex hash
        if let userId {
            let hash = userId.data(using: .utf8)!.map { String(format: "%02x", $0) }.joined()
            let truncated = String(hash.prefix(16))
            // Analytics.setUserID(truncated)
            AppLogger.general.debug("Analytics: user set \(truncated)")
        } else {
            // Analytics.setUserID(nil)
        }
    }
}
