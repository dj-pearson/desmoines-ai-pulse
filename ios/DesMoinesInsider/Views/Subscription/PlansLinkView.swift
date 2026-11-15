import SwiftUI

/// What a web billing link (/pricing, /subscription, /subscription/success)
/// opens in the app (IOS-AUDIT-010). The web pages sell and manage plans
/// through Stripe, which the app may not show (Guideline 3.1.1), so the link
/// gets the screen the Profile tab's plan card would give the same person.
enum PlansLinkScreen: Equatable {
    /// The StoreKit store: buy a plan, or change an App Store one.
    case store
    /// Which store bills the plan and that it is managed there. A web or
    /// Google Play subscriber is never shown a store they could buy a second
    /// plan in (IOS-DD-MONETIZATION-16).
    case planInfo

    static func screen(tier: SubscriptionTier, hasAppStoreSubscription: Bool) -> PlansLinkScreen {
        if tier == .free || hasAppStoreSubscription { return .store }
        return .planInfo
    }
}

struct PlansLinkView: View {
    @State private var storeKit = StoreKitService.shared

    var body: some View {
        switch PlansLinkScreen.screen(
            tier: storeKit.currentTier,
            hasAppStoreSubscription: storeKit.hasAppStoreSubscription
        ) {
        case .store:
            SubscriptionView()
        case .planInfo:
            PlanInfoSheet(tier: storeKit.currentTier, subscriptions: storeKit.crossPlatformSubscriptions)
        }
    }
}
