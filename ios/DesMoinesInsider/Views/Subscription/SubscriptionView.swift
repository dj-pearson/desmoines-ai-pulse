import SwiftUI
import StoreKit

/// Subscription management view using Apple's SubscriptionStoreView.
///
/// Per Guideline 3.1.2(c), SubscriptionStoreView automatically includes
/// required subscription terms, pricing, and links to Terms of Use and Privacy Policy.
///
/// Per Guideline 2.1(b), SubscriptionStoreView handles product loading,
/// purchase flow, and error states natively via StoreKit.
struct SubscriptionView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var storeKit = StoreKitService.shared

    var body: some View {
        // Bound on the main actor here, then handed to the async provider
        // below, so the store view binds purchases to this account the same
        // way PaywallView does (IOS-DD-MONETIZATION-05 / -02).
        let purchaseOptions = StoreKitService.purchaseOptions(for: AuthService.shared.currentUser?.id)
        NavigationStack {
            SubscriptionStoreView(groupID: StoreKitService.subscriptionGroupID) {
                marketingContent
            }
            .subscriptionStoreControlStyle(.prominentPicker)
            .subscriptionStoreButtonLabel(.multiline)
            .storeButton(.visible, for: .restorePurchases)
            .subscriptionStorePolicyDestination(
                url: Config.siteURL.appendingPathComponent("terms"),
                for: .termsOfService
            )
            .subscriptionStorePolicyDestination(
                url: Config.siteURL.appendingPathComponent("privacy-policy"),
                for: .privacyPolicy
            )
            .inAppPurchaseOptions { _ in purchaseOptions }
            // The completion used to only dismiss, so a purchase here was not
            // finished, synced to the server or reflected in the tier until
            // StoreKit happened to re-emit it (IOS-DD-MONETIZATION-05).
            .onInAppPurchaseCompletion { _, result in
                if await storeKit.handleCompletedPurchase(result) {
                    dismiss()
                }
            }
            .navigationTitle("Premium")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    // MARK: - Marketing Content

    private var marketingContent: some View {
        VStack(spacing: 16) {
            Image(systemName: "sparkles")
                .font(.system(size: 44))
                .foregroundStyle(Color.accentColor.gradient)
                .accessibilityHidden(true)

            Text("Unlock Premium")
                .font(.title2.bold())

            Text("Get more out of Des Moines Insider with premium features.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            currentTierBadge

            crossPlatformBanner

            featuresList
        }
        .padding()
    }

    // MARK: - Cross-Platform Banner

    /// Surfaces other-platform subscriptions (web/Stripe, Android/Play) so the
    /// user knows where to manage / cancel them. App Store guidelines forbid
    /// linking to external paid flows from inside an IAP screen, so we only
    /// surface informational copy here — no out-bound buttons.
    @ViewBuilder
    private var crossPlatformBanner: some View {
        if !storeKit.crossPlatformSubscriptions.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(storeKit.crossPlatformSubscriptions) { sub in
                    HStack(spacing: 8) {
                        Image(systemName: bannerIcon(for: sub.platform))
                            .foregroundStyle(.secondary)
                            .accessibilityHidden(true)
                        Text(bannerCopy(for: sub))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.leading)
                    }
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
            .padding(.horizontal)
        }
    }

    private func bannerIcon(for platform: StoreKitService.CrossPlatformSubscription.Platform) -> String {
        switch platform {
        case .web: return "globe"
        case .android: return "smartphone"
        }
    }

    private func bannerCopy(for sub: StoreKitService.CrossPlatformSubscription) -> String {
        let where_: String = {
            switch sub.platform {
            case .web: return "via the website"
            case .android: return "on Google Play"
            }
        }()
        return "You also have an active \(sub.tier.displayName) subscription \(where_). Manage or cancel it from where you bought it."
    }

    // MARK: - Current Tier Badge

    private var currentTierBadge: some View {
        VStack(spacing: 10) {
            // The server rejected a receipt this device still holds, so the tier
            // above has already been lowered (StoreKitService:120 subtracts the
            // revoked ids before resolving). Without this the user simply drops
            // from Insider to Free with no explanation and no route to a fix.
            //
            // hasServerRevokedEntitlement was written for exactly this - its
            // docstring says "UI can surface a subscription could not be verified
            // state" - and nothing read it until now.
            if storeKit.hasServerRevokedEntitlement {
                revokedEntitlementNotice
            }

            tierBadgeRow
        }
    }

    /// The server refused the subscription because another account holds it
    /// (IOS-DD-MONETIZATION-03). Restore passes `transfer: true`, which is the
    /// one way to move it here.
    private var isAccountMismatch: Bool {
        storeKit.serverRejectionReason == .accountMismatch
    }

    private var revokedEntitlementNotice: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(isAccountMismatch
                     ? "This subscription belongs to another account"
                     : "We couldn't verify your subscription")
                    .font(.subheadline.weight(.semibold))
                Text(isAccountMismatch
                     ? "The App Store subscription on this device is linked to a different Des Moines Insider account. Sign in to that account, or tap Restore to move it here."
                     : "Your purchase could not be confirmed with the App Store, so premium features are paused. Restoring purchases usually fixes it.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Button("Restore Purchases") {
                    Task { await storeKit.restorePurchases() }
                }
                .font(.footnote.weight(.semibold))
                .padding(.top, 2)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }

    private var tierBadgeRow: some View {
        HStack(spacing: 8) {
            Image(systemName: badgeIcon(for: storeKit.currentTier))
                .foregroundStyle(badgeColor(for: storeKit.currentTier))
            Text("Current Plan: \(storeKit.currentTier.displayName)")
                .font(.subheadline.weight(.semibold))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(badgeColor(for: storeKit.currentTier).opacity(0.1), in: Capsule())
        .accessibilityLabel("Your current plan is \(storeKit.currentTier.displayName)")
    }

    // MARK: - Pricing

    /// "Insider - $4.99/mo" built from the loaded StoreKit product.
    ///
    /// These two headings were hardcoded USD strings on a LIVE screen
    /// (IOS-AUDIT-FEAT-036). Two things were wrong with that, and the second is
    /// the one that matters: a literal price can drift from what App Store
    /// Connect actually charges, and "$4.99" is shown to a user in London who
    /// will be billed in pounds. Product.displayPrice is localized and
    /// currency-correct by construction.
    ///
    /// THE NAME ALONE WHEN PRODUCTS HAVE NOT LOADED, not a fallback price.
    /// StoreKit products load asynchronously and fail offline, and a wrong price
    /// is worse than no price: the user reads it, decides on it, and is charged
    /// something else. The list still says what the tier includes.
    private func tierHeading(_ name: String, tier: SubscriptionTier) -> String {
        // Qualified: this file imports StoreKit, where a bare
        // `SubscriptionPeriod` resolves to Product.SubscriptionPeriod rather
        // than ours.
        let product = StoreKitService.SubscriptionPeriod.allCases
            .lazy
            .compactMap { storeKit.product(for: tier, period: $0) }
            .first
        guard let product else { return name }
        return "\(name) - \(product.displayPrice)"
    }

    // MARK: - Features List

    private var featuresList: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(tierHeading("Insider", tier: .insider))
                .font(.caption.weight(.bold))
                .foregroundStyle(.orange)
            // Only what iOS delivers (IOS-DD-MONETIZATION-11). Advanced
            // filters are free on iOS and early access has no consumer.
            featureRow(icon: "map.fill", color: .orange, text: "AI Trip Planner (5 itineraries/month)")
            featureRow(icon: "heart.fill", color: .orange, text: "Unlimited favorites")
            featureRow(icon: "pencil.line", color: .orange, text: "Write reviews & ratings")
            featureRow(icon: "bell.badge.fill", color: .orange, text: "Saved searches & event alerts (up to 10)")
            featureRow(icon: "eye.slash.fill", color: .orange, text: "Ad-free experience")

            Divider()
                .padding(.vertical, 4)

            Text(tierHeading("VIP", tier: .vip))
                .font(.caption.weight(.bold))
                .foregroundStyle(.purple)
            // The two differences that are real on iOS: TripPlannerView's
            // monthly quota and entitled_plan_limit's saved-search cap. The
            // five VIP lines that were here had no implementation
            // (WEB-FEAT-016 removed the same lines on web).
            featureRow(icon: "checkmark.circle.fill", color: .purple, text: "Everything in Insider, plus:")
            featureRow(icon: "map.fill", color: .purple, text: "Unlimited AI Trip Planner")
            featureRow(icon: "bell.badge.fill", color: .purple, text: "Unlimited saved searches & alerts")
        }
        .padding(.horizontal)
    }

    private func featureRow(icon: String, color: Color, text: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundStyle(color)
                .frame(width: 20)
                .accessibilityHidden(true)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Helpers

    private func badgeIcon(for tier: SubscriptionTier) -> String {
        switch tier {
        case .free: return "person.fill"
        case .insider: return "star.fill"
        case .vip: return "crown.fill"
        }
    }

    private func badgeColor(for tier: SubscriptionTier) -> Color {
        switch tier {
        case .free: return .secondary
        case .insider: return .orange
        case .vip: return .purple
        }
    }
}

#Preview {
    SubscriptionView()
}
