import Foundation

// MARK: - IOS-SUB-011 · Central premium-feature catalog
//
// One source of truth for "which features need which tier", mirroring the web
// `useSubscription().hasFeature()` switch (src/hooks/useSubscription.ts) so web
// and iOS gate the same things the same way. Each feature also knows which
// tailored `PaywallContext` (IOS-SUB-010) to present when it's locked.
//
// Check access with `StoreKitService.shared.hasFeature(_:)`.

enum PremiumFeature: String, CaseIterable {
    // Insider+ features
    case unlimitedFavorites = "unlimited_favorites"
    case earlyAccess        = "early_access"
    case advancedFilters    = "advanced_filters"
    case adFree             = "ad_free"
    case dailyDigest        = "daily_digest"
    case prioritySupport    = "priority_support"
    case tripPlanner        = "trip_planner"
    case writeReviews       = "write_reviews"
    case saveSearches       = "save_searches"
    case createAlerts       = "create_alerts"
    // VIP-only features
    case vipEvents             = "vip_events"
    case reservationAssistance = "reservation_assistance"
    case smsAlerts             = "sms_alerts"
    case concierge             = "concierge"
    case localPerks            = "local_perks"

    /// Minimum tier required to use this feature. Mirrors web `hasFeature()`:
    /// the five cases below are VIP-only; everything else is Insider+.
    var requiredTier: SubscriptionTier {
        switch self {
        case .vipEvents, .reservationAssistance, .smsAlerts, .concierge, .localPerks:
            return .vip
        default:
            return .insider
        }
    }

    /// Whether iOS actually delivers this feature today. The raw values stay
    /// for cross-platform parity (they mirror the web catalog), but nothing
    /// may sell an un-offered feature: WEB-FEAT-016 found VIP listing eight
    /// benefits and delivering none, and the iOS storefront repeated them
    /// (IOS-DD-MONETIZATION-11). Advanced filters are free on iOS.
    var isOffered: Bool {
        switch self {
        case .earlyAccess, .advancedFilters, .dailyDigest, .prioritySupport,
             .vipEvents, .reservationAssistance, .smsAlerts, .concierge, .localPerks:
            return false
        case .unlimitedFavorites, .adFree, .tripPlanner, .writeReviews, .saveSearches, .createAlerts:
            return true
        }
    }

    /// The tailored paywall to present when this feature is locked. Falls back
    /// to a generic context (built from the required tier + a short blurb) for
    /// features without a bespoke preset.
    var paywallContext: PaywallContext {
        switch self {
        case .unlimitedFavorites: return .unlimitedFavorites
        case .tripPlanner:        return .tripPlanner
        case .adFree:             return .adFree
        case .saveSearches:       return .savedSearches
        case .createAlerts:       return .customAlerts
        default:                  return .generic(tier: requiredTier, feature: marketingBlurb)
        }
    }

    /// Short upsell blurb for features without a bespoke `PaywallContext`.
    /// Un-offered features get a neutral line instead of a description of
    /// something that does not exist (IOS-DD-MONETIZATION-11).
    var marketingBlurb: String {
        guard isOffered else {
            return "See everything \(requiredTier.displayName) includes."
        }
        switch self {
        case .writeReviews:        return "Write reviews & ratings and share your take with the city."
        default:                   return "Unlock this premium feature."
        }
    }

    // MARK: - Quota actions (count-limited features)

    /// Features whose access is a per-tier COUNT limit rather than a simple
    /// on/off gate. The limit comes from `SubscriptionTier` (see below).
    enum QuotaAction {
        case favorites, savedSearches, alerts, tripPlans

        /// The per-tier limit; `-1` means unlimited. Mirrors the web
        /// `SubscriptionLimits` and the PRD (Insider 5 trips/mo, VIP unlimited).
        func limit(for tier: SubscriptionTier) -> Int {
            switch self {
            case .favorites:    return tier.maxFavorites
            case .savedSearches: return tier.maxSavedSearches
            case .alerts:       return tier.maxAlerts
            case .tripPlans:    return tier.maxTripPlansPerMonth
            }
        }

        /// Whether `currentCount` is still within the tier's limit.
        func isWithinLimit(_ currentCount: Int, for tier: SubscriptionTier) -> Bool {
            let limit = limit(for: tier)
            if limit < 0 { return true } // unlimited
            return currentCount < limit
        }

        /// Remaining quota, or nil when unlimited.
        func remaining(_ currentCount: Int, for tier: SubscriptionTier) -> Int? {
            let limit = limit(for: tier)
            if limit < 0 { return nil }
            return max(0, limit - currentCount)
        }
    }
}
