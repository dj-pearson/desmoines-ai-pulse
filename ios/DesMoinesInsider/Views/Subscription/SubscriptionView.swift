import SwiftUI
import StoreKit

/// Subscription management view showing available plans, current tier, and purchase/restore options.
struct SubscriptionView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var storeKit = StoreKitService.shared
    @State private var toast: ToastMessage?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    headerSection
                    currentTierBadge

                    if storeKit.isLoading && storeKit.products.isEmpty {
                        ProgressView("Loading plans...")
                            .padding(.top, 40)
                    } else if storeKit.products.isEmpty {
                        EmptyStateView(
                            icon: "bag.badge.questionmark",
                            title: "Plans Unavailable",
                            message: "Subscription plans could not be loaded. Please check your connection and try again.",
                            actionTitle: "Retry",
                            action: { Task { await storeKit.loadProducts() } }
                        )
                        .padding(.top, 20)
                    } else {
                        // Insider tier
                        if !storeKit.insiderProducts.isEmpty {
                            tierSection(
                                title: "Insider",
                                icon: "star.fill",
                                color: .orange,
                                features: [
                                    "Unlimited favorites",
                                    "Advanced search filters",
                                    "Event reminders",
                                    "Ad-free experience",
                                ],
                                products: storeKit.insiderProducts,
                                isCurrentTier: storeKit.currentTier == .insider
                            )
                        }

                        // VIP tier
                        if !storeKit.vipProducts.isEmpty {
                            tierSection(
                                title: "VIP",
                                icon: "crown.fill",
                                color: .purple,
                                features: [
                                    "Everything in Insider",
                                    "AI Trip Planner",
                                    "Priority support",
                                    "Early access to features",
                                ],
                                products: storeKit.vipProducts,
                                isCurrentTier: storeKit.currentTier == .vip
                            )
                        }
                    }

                    // Restore purchases
                    Button {
                        Task {
                            await storeKit.restorePurchases()
                            toast = ToastMessage(text: "Purchases restored", icon: "checkmark.circle", style: .success)
                        }
                    } label: {
                        Text("Restore Purchases")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(Color.accentColor)
                    }
                    .padding(.top, 8)
                    .accessibilityLabel("Restore previous purchases")

                    // Manage subscription link
                    if storeKit.currentTier != .free {
                        Button {
                            openSubscriptionManagement()
                        } label: {
                            Label("Manage Subscription", systemImage: "gearshape")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        .accessibilityLabel("Manage your subscription in Apple Settings")
                    }

                    // Legal text
                    legalText
                }
                .padding()
            }
            .navigationTitle("Premium")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .toastOverlay(message: $toast)
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 8) {
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
        }
        .padding(.top, 8)
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

    // MARK: - Tier Section

    private func tierSection(
        title: String,
        icon: String,
        color: Color,
        features: [String],
        products: [Product],
        isCurrentTier: Bool
    ) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            // Tier header
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .foregroundStyle(color)
                Text(title)
                    .font(.headline)
                if isCurrentTier {
                    Text("Current")
                        .font(.caption2.bold())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(color, in: Capsule())
                }
            }

            // Features list
            ForEach(features, id: \.self) { feature in
                HStack(spacing: 10) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.caption)
                        .foregroundStyle(color)
                        .accessibilityHidden(true)
                    Text(feature)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            // Product cards
            ForEach(products) { product in
                productCard(product: product, color: color, isCurrentTier: isCurrentTier)
            }
        }
        .padding()
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Product Card

    private func productCard(product: Product, color: Color, isCurrentTier: Bool) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(product.displayName)
                    .font(.subheadline.weight(.semibold))
                Text(product.displayPrice)
                    .font(.headline)
                    .foregroundStyle(color)
                if let period = product.subscription?.subscriptionPeriod {
                    Text(periodLabel(period))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            if isCurrentTier {
                Text("Active")
                    .font(.caption.bold())
                    .foregroundStyle(color)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(color.opacity(0.1), in: Capsule())
            } else {
                Button {
                    Task {
                        do {
                            try await storeKit.purchase(product)
                            toast = ToastMessage(text: "Welcome to \(product.displayName)!", icon: "party.popper", style: .success)
                        } catch {
                            // Error is set on storeKit.errorMessage
                        }
                    }
                } label: {
                    Text("Subscribe")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(color, in: Capsule())
                }
                .disabled(storeKit.isLoading)
                .accessibilityLabel("Subscribe to \(product.displayName) for \(product.displayPrice)")
            }
        }
        .padding()
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Legal Text

    private var legalText: some View {
        Text("Subscriptions automatically renew unless canceled at least 24 hours before the end of the current period. You can manage or cancel your subscription in your Apple ID settings. Payment will be charged to your Apple ID account at confirmation of purchase.")
            .font(.caption2)
            .foregroundStyle(.tertiary)
            .multilineTextAlignment(.center)
            .padding(.horizontal)
            .padding(.top, 8)
            .accessibilityLabel("Auto-renewal legal terms")
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

    private func periodLabel(_ period: Product.SubscriptionPeriod) -> String {
        switch period.unit {
        case .month: return period.value == 1 ? "per month" : "every \(period.value) months"
        case .year: return period.value == 1 ? "per year" : "every \(period.value) years"
        case .week: return period.value == 1 ? "per week" : "every \(period.value) weeks"
        case .day: return period.value == 1 ? "per day" : "every \(period.value) days"
        @unknown default: return ""
        }
    }

    private func openSubscriptionManagement() {
        if let url = URL(string: "https://apps.apple.com/account/subscriptions") {
            UIApplication.shared.open(url)
        }
    }
}

#Preview {
    SubscriptionView()
}
