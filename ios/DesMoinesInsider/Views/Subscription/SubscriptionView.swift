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
            .onInAppPurchaseCompletion { _, result in
                if case .success(.success) = result {
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

            featuresList
        }
        .padding()
    }

    // MARK: - Current Tier Badge

    private var currentTierBadge: some View {
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

    // MARK: - Features List

    private var featuresList: some View {
        VStack(alignment: .leading, spacing: 10) {
            featureRow(icon: "heart.fill", color: .orange, text: "Unlimited favorites")
            featureRow(icon: "magnifyingglass", color: .orange, text: "Advanced search filters")
            featureRow(icon: "bell.fill", color: .orange, text: "Event reminders")
            featureRow(icon: "eye.slash.fill", color: .orange, text: "Ad-free experience")
            featureRow(icon: "map.fill", color: .purple, text: "AI Trip Planner (VIP)")
            featureRow(icon: "star.fill", color: .purple, text: "Priority support (VIP)")
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
