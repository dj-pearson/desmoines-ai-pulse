import SwiftUI

/// A reusable overlay that locks premium content behind a subscription tier.
/// Shows a blurred preview of the content with an upgrade prompt.
///
/// Usage:
/// ```swift
/// PremiumGate(requiredTier: .insider, feature: "Advanced Filters") {
///     AdvancedFilterContent()
/// }
/// ```
struct PremiumGate<Content: View>: View {
    let requiredTier: SubscriptionTier
    let feature: String
    @ViewBuilder let content: () -> Content

    @State private var storeKit = StoreKitService.shared
    @State private var showSubscription = false

    private var hasAccess: Bool {
        switch requiredTier {
        case .free:
            return true
        case .insider:
            return storeKit.currentTier == .insider || storeKit.currentTier == .vip
        case .vip:
            return storeKit.currentTier == .vip
        }
    }

    var body: some View {
        if hasAccess {
            content()
        } else {
            lockedOverlay
        }
    }

    private var lockedOverlay: some View {
        VStack(spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "lock.fill")
                    .font(.subheadline)
                    .foregroundStyle(.orange)

                Text("\(requiredTier.displayName) Feature")
                    .font(.subheadline.weight(.semibold))

                Spacer()
            }

            Text(feature)
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)

            Button {
                showSubscription = true
            } label: {
                Text("Unlock with \(requiredTier.displayName)")
                    .font(.caption.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 10))
                    .foregroundStyle(.white)
            }
            .accessibilityLabel("Upgrade to \(requiredTier.displayName) to unlock \(feature)")
        }
        .padding(14)
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.orange.opacity(0.2), lineWidth: 1)
        )
        .sheet(isPresented: $showSubscription) {
            SubscriptionView()
        }
    }
}

/// Inline premium lock label used for individual rows/buttons.
/// Shows a lock icon and "Insider" badge next to the label.
struct PremiumBadge: View {
    var tier: SubscriptionTier = .insider

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "lock.fill")
                .font(.system(size: 9))
            Text(tier.displayName)
                .font(.system(size: 10, weight: .semibold))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(tier == .vip ? Color.purple : Color.orange, in: Capsule())
    }
}

#Preview("Locked Gate") {
    PremiumGate(requiredTier: .insider, feature: "Advanced search filters including distance, price range, and rating") {
        Text("Premium Content Here")
    }
    .padding()
}

#Preview("Badge") {
    VStack(spacing: 12) {
        PremiumBadge(tier: .insider)
        PremiumBadge(tier: .vip)
    }
}
