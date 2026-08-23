import Foundation
import os
import CryptoKit

/// EMITS NOTHING. This is a stub, and every track* call below ends at a debug
/// log line that release builds do not keep.
///
/// The previous docstring described it as "a lightweight analytics facade that
/// wraps Firebase Analytics", which reads as working code with Firebase behind
/// it. There is no Firebase dependency, no GoogleService-Info.plist, and every
/// Analytics.logEvent call is commented out. Anyone reading a funnel report and
/// seeing no iOS data would reasonably conclude iOS users are not converting,
/// rather than that iOS never reported (IOS-AUDIT-FEAT-030 AC5, XPLAT-004 AC5).
///
/// ANDROID DOES EMIT, through a real Firebase sink, and its own docstring says
/// "Event names mirror iOS verbatim". The names do match; the data does not.
/// Any cross-platform comparison built on that is measuring Android against
/// zero.
///
/// The consent gate below is real and is kept: when this is activated, the gate
/// must already be in the path rather than be added afterwards.
///
/// To activate (XPLAT-004 AC2 decides whether Firebase is the right target at
/// all - the web surface uses Sentry, and routing both mobile apps through the
/// existing log-error function would unify them instead):
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

    // MARK: - Win-back / renewal (IOS-SUB-014)

    /// `state`: expiring_soon / billing_retry / grace / expired.
    func trackRenewalBanner(action: String, state: String) {
        trackEvent("renewal_banner", parameters: ["action": action, "state": state])
    }

    func trackOfferCodeRedeem(action: String) {
        trackEvent("offer_code_redeem", parameters: ["action": action])
    }

    // MARK: - User Properties

    func setUserId(_ userId: String?) {
        guard ConsentService.shared.analyticsConsent else { return }
        if let userId {
            // SHA-256 the UUID, then truncate. The prior code hex-encoded the raw
            // UTF-8 bytes — a reversible encoding of the literal UUID, not a hash
            // (IOS-AUDIT-SEC-004). A truncated digest is not derivable back to the
            // source id.
            let digest = SHA256.hash(data: Data(userId.utf8))
            let hex = digest.map { String(format: "%02x", $0) }.joined()
            let pseudonymousId = String(hex.prefix(16))
            // Analytics.setUserID(pseudonymousId)
            AppLogger.general.debug("Analytics: user set \(pseudonymousId)")
        } else {
            // Analytics.setUserID(nil)
        }
    }
}
