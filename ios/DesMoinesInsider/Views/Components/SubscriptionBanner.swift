import SwiftUI
import StoreKit

/// A prominent subscription status card that shows the user's current plan
/// and a clear upgrade CTA for free users. Used on Profile and Favorites tabs.
struct SubscriptionBanner: View {
    @State private var storeKit = StoreKitService.shared
    @State private var showSubscription = false

    /// Compact mode shows a single-line banner; full mode shows a richer card.
    var style: Style = .full

    enum Style {
        case full
        case compact
    }

    var body: some View {
        Group {
            switch style {
            case .full:
                fullBanner
            case .compact:
                compactBanner
            }
        }
        .sheet(isPresented: $showSubscription) {
            SubscriptionView()
        }
    }

    // MARK: - Full Banner (for Profile)

    private var fullBanner: some View {
        Group {
            if storeKit.currentTier == .free {
                freeUserCard
            } else {
                subscribedCard
            }
        }
    }

    private var freeUserCard: some View {
        VStack(spacing: 14) {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(Color.orange.gradient)
                        .frame(width: 44, height: 44)
                    Image(systemName: "sparkles")
                        .font(.title3)
                        .foregroundStyle(.white)
                }
                .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Free Plan")
                        .font(.headline)
                    Text("Unlock unlimited favorites, AI Trip Planner, advanced filters & more")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                Spacer()
            }

            Button {
                showSubscription = true
            } label: {
                Text("Upgrade to Premium")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 10))
                    .foregroundStyle(.white)
            }
            .accessibilityLabel("Upgrade to a premium subscription plan")
        }
        .padding(18)
        .glassCard(cornerRadius: PremiumTokens.cornerLg, material: .regularMaterial, elevation: PremiumTokens.elevation4)
    }

    private var subscribedCard: some View {
        Button {
            showSubscription = true
        } label: {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(tierColor.gradient)
                        .frame(width: 44, height: 44)
                    Image(systemName: tierIcon)
                        .font(.title3)
                        .foregroundStyle(.white)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text("\(storeKit.currentTier.displayName) Plan")
                        .font(.headline)
                    Text("Manage your subscription")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .padding(18)
            .background(tierColor.opacity(0.08))
            .glassCard(cornerRadius: PremiumTokens.cornerLg, material: .regularMaterial, elevation: PremiumTokens.elevation4)
            .overlay(
                RoundedRectangle(cornerRadius: PremiumTokens.cornerLg, style: .continuous)
                    .strokeBorder(tierColor.opacity(0.3), lineWidth: 1)
            )
        }
        .buttonStyle(.pressableCard)
        .accessibilityLabel("\(storeKit.currentTier.displayName) plan. Tap to manage subscription.")
    }

    // MARK: - Compact Banner (for Favorites, Home, etc.)

    private var compactBanner: some View {
        Group {
            if storeKit.currentTier == .free {
                compactFreeCard
            }
            // Don't show anything for subscribed users in compact mode
        }
    }

    private var compactFreeCard: some View {
        Button {
            showSubscription = true
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "sparkles")
                    .font(.subheadline)
                    .foregroundStyle(.orange)

                Text("Upgrade for unlimited favorites, Trip Planner & more")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.primary)

                Spacer()

                Text("Upgrade")
                    .font(.caption.bold())
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.accentColor, in: Capsule())
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Color.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Upgrade to premium for unlimited favorites and more features")
    }

    // MARK: - Helpers

    private var tierColor: Color {
        switch storeKit.currentTier {
        case .free: return .secondary
        case .insider: return .orange
        case .vip: return .purple
        }
    }

    private var tierIcon: String {
        switch storeKit.currentTier {
        case .free: return "person.fill"
        case .insider: return "star.fill"
        case .vip: return "crown.fill"
        }
    }
}

// MARK: - Favorites Limit Banner

/// Shows the current favorites usage against the free tier limit,
/// with an upgrade prompt when approaching or at the limit.
struct FavoritesLimitBanner: View {
    let currentCount: Int
    @State private var storeKit = StoreKitService.shared
    @State private var showSubscription = false

    private var maxFavorites: Int { SubscriptionTier.free.maxFavorites }
    private var isAtLimit: Bool { currentCount >= maxFavorites }
    private var isNearLimit: Bool { currentCount >= maxFavorites - 10 }
    private var progress: Double { min(Double(currentCount) / Double(maxFavorites), 1.0) }

    var body: some View {
        // Only show for free users who have saved items
        if storeKit.currentTier == .free && currentCount > 0 {
            VStack(spacing: 10) {
                HStack {
                    Text("\(currentCount)/\(maxFavorites) saves used")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(isAtLimit ? .red : isNearLimit ? .orange : .secondary)

                    Spacer()

                    if isNearLimit {
                        Button {
                            showSubscription = true
                        } label: {
                            Text("Go Unlimited")
                                .font(.caption.bold())
                                .foregroundStyle(.white)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 5)
                                .background(Color.accentColor, in: Capsule())
                        }
                        .accessibilityLabel("Upgrade to premium for unlimited saves")
                    }
                }

                // Progress bar
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(Color(.systemGray5))
                            .frame(height: 6)

                        Capsule()
                            .fill(isAtLimit ? Color.red : isNearLimit ? Color.orange : Color.accentColor)
                            .frame(width: geo.size.width * progress, height: 6)
                    }
                }
                .frame(height: 6)

                if isAtLimit {
                    Text("You've reached the free plan limit. Upgrade to save unlimited favorites.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(
                isAtLimit ? Color.red.opacity(0.06) :
                isNearLimit ? Color.orange.opacity(0.06) :
                Color(.systemGray6),
                in: RoundedRectangle(cornerRadius: 12)
            )
            .sheet(isPresented: $showSubscription) {
                SubscriptionView()
            }
        }
    }
}

#Preview("Free User - Full") {
    SubscriptionBanner(style: .full)
        .padding()
}

#Preview("Free User - Compact") {
    SubscriptionBanner(style: .compact)
        .padding()
}

#Preview("Favorites Limit") {
    VStack(spacing: 20) {
        FavoritesLimitBanner(currentCount: 15)
        FavoritesLimitBanner(currentCount: 42)
        FavoritesLimitBanner(currentCount: 50)
    }
    .padding()
}
