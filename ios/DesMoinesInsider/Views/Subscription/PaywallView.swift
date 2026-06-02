import SwiftUI
import StoreKit

// MARK: - IOS-SUB-010 · Contextual paywall
//
// A reusable paywall that appears at the moment a user hits a locked feature,
// with copy tailored to that feature (vs the generic SubscriptionView pricing
// screen). Built on StoreKit 2 directly so we can preselect the right tier for
// the context, offer a monthly/annual toggle, and log per-surface conversion.
//
// Present it with a `PaywallContext` describing the feature the user just hit:
//
//   .sheet(isPresented: $showPaywall) { PaywallView(context: .tripPlanner) }

/// The upsell context a paywall is shown for. `id` is the analytics key.
struct PaywallContext: Identifiable, Equatable {
    let id: String
    let icon: String
    let headline: String
    let subheadline: String
    let benefits: [String]
    let recommendedTier: SubscriptionTier

    static func == (lhs: PaywallContext, rhs: PaywallContext) -> Bool { lhs.id == rhs.id }
}

// MARK: - Tailored contexts (one per gated surface)

extension PaywallContext {
    static let unlimitedFavorites = PaywallContext(
        id: "unlimited_favorites",
        icon: "heart.fill",
        headline: "Save everything you love",
        subheadline: "You've reached the free limit of 3 saved items. Go Insider for unlimited favorites.",
        benefits: [
            "Unlimited saved events, restaurants & attractions",
            "Sync your saves across all your devices",
            "Never lose track of a place again",
        ],
        recommendedTier: .insider
    )

    static let tripPlanner = PaywallContext(
        id: "trip_planner",
        icon: "map.fill",
        headline: "Plan the perfect day with AI",
        subheadline: "The AI Trip Planner builds a personalized Des Moines itinerary in seconds.",
        benefits: [
            "AI-built itineraries tuned to your tastes",
            "5 trips / month on Insider, unlimited on VIP",
            "Mix events, dining and attractions automatically",
        ],
        recommendedTier: .insider
    )

    static let insiderTips = PaywallContext(
        id: "insider_tips",
        icon: "lightbulb.fill",
        headline: "Unlock insider tips",
        subheadline: "Local-only tips, the best times to go, and what not to miss — for every event.",
        benefits: [
            "Insider tips on events across the city",
            "Know the best time to arrive & beat the crowd",
            "Local secrets you won't find anywhere else",
        ],
        recommendedTier: .insider
    )

    static let diningTips = PaywallContext(
        id: "dining_tips",
        icon: "fork.knife",
        headline: "Eat like a local",
        subheadline: "Get dining tips, must-order dishes and reservation know-how for every restaurant.",
        benefits: [
            "Must-order dishes & menu tips",
            "When to go and how to get a table",
            "Local favorites the guides skip",
        ],
        recommendedTier: .insider
    )

    static let savedSearches = PaywallContext(
        id: "saved_searches",
        icon: "bookmark.fill",
        headline: "Save your searches",
        subheadline: "Keep your favorite searches one tap away and let us watch them for you.",
        benefits: [
            "Save any search or filter combination",
            "Jump back in with a single tap",
            "Pairs with custom alerts for new matches",
        ],
        recommendedTier: .insider
    )

    static let customAlerts = PaywallContext(
        id: "custom_alerts",
        icon: "bell.badge.fill",
        headline: "Never miss what matters",
        subheadline: "Get notified the moment new events match what you care about.",
        benefits: [
            "Custom alerts for your interests & areas",
            "Push notifications for new matching events",
            "First to know about can't-miss happenings",
        ],
        recommendedTier: .insider
    )

    static let advancedFilters = PaywallContext(
        id: "advanced_filters",
        icon: "slider.horizontal.3",
        headline: "Filter like a pro",
        subheadline: "Narrow results by distance, price, rating and more to find exactly what you want.",
        benefits: [
            "Distance radius, price & minimum-rating filters",
            "Combine advanced facets in one search",
            "Find the perfect spot, faster",
        ],
        recommendedTier: .insider
    )

    static let adFree = PaywallContext(
        id: "ad_free",
        icon: "eye.slash.fill",
        headline: "Enjoy an ad-free experience",
        subheadline: "Go Insider to remove ads and support local Des Moines coverage.",
        benefits: [
            "No banner or in-feed ads, anywhere",
            "A faster, cleaner browsing experience",
            "Support independent local journalism",
        ],
        recommendedTier: .insider
    )

    /// Fallback context built from a required tier + a short feature blurb,
    /// used by `PremiumGate` when no tailored context is supplied.
    static func generic(tier: SubscriptionTier, feature: String) -> PaywallContext {
        let resolved: SubscriptionTier = tier == .free ? .insider : tier
        let bullets = Array(resolved.features.filter { !$0.hasSuffix("plus:") }.prefix(4))
        return PaywallContext(
            id: "generic",
            icon: resolved == .vip ? "crown.fill" : "sparkles",
            headline: "Unlock \(resolved.displayName)",
            subheadline: feature,
            benefits: bullets,
            recommendedTier: resolved
        )
    }
}

// MARK: - PaywallView

struct PaywallView: View {
    let context: PaywallContext

    @Environment(\.dismiss) private var dismiss
    @State private var storeKit = StoreKitService.shared
    @State private var selectedTier: SubscriptionTier
    @State private var selectedPeriod: StoreKitService.SubscriptionPeriod = .monthly
    @State private var isPurchasing = false
    @State private var errorMessage: String?
    /// Set once a purchase/restore succeeds so `onDisappear` doesn't log a
    /// "dismiss" (abandon) event on top of the conversion.
    @State private var didConvert = false

    private let analytics = AnalyticsService.shared

    init(context: PaywallContext) {
        self.context = context
        let recommended: SubscriptionTier = context.recommendedTier == .free ? .insider : context.recommendedTier
        _selectedTier = State(initialValue: recommended)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    header
                    benefitsList
                    tierSelector
                    if periods.count > 1 { periodToggle }
                    if let errorMessage {
                        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                            .font(.caption)
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding()
                .padding(.bottom, 160) // room for the pinned footer
            }
            .safeAreaInset(edge: .bottom) { purchaseFooter }
            .navigationTitle("Go Premium")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Not now") { dismiss() }
                        .accessibilityLabel("Dismiss upgrade screen")
                }
            }
            .task { await storeKit.loadProducts() }
            .onAppear {
                analytics.trackPaywallPresented(context: context.id, tier: selectedTier.rawValue)
            }
            .onDisappear {
                if !didConvert { analytics.trackPaywallDismissed(context: context.id) }
            }
        }
    }

    // MARK: Header

    private var header: some View {
        VStack(spacing: 12) {
            Image(systemName: context.icon)
                .font(.system(size: 44))
                .foregroundStyle(Color.accentColor.gradient)
                .accessibilityHidden(true)

            Text(context.headline)
                .font(.title2.bold())
                .multilineTextAlignment(.center)

            Text(context.subheadline)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: Benefits

    private var benefitsList: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(context.benefits, id: \.self) { benefit in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                        .accessibilityHidden(true)
                    Text(benefit)
                        .font(.subheadline)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
    }

    // MARK: Tier selector

    private var tierSelector: some View {
        VStack(spacing: 10) {
            ForEach([SubscriptionTier.insider, .vip], id: \.self) { tier in
                tierCard(tier)
            }
        }
    }

    private func tierCard(_ tier: SubscriptionTier) -> some View {
        let isSelected = selectedTier == tier
        let isCurrent = StoreKitService.rank(storeKit.currentTier) >= StoreKitService.rank(tier)
        let tint: Color = tier == .vip ? .purple : .orange
        return Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            selectedTier = tier
            clampPeriod()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: tier == .vip ? "crown.fill" : "star.fill")
                    .foregroundStyle(tint)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(tier.displayName).font(.headline)
                        if tier == context.recommendedTier {
                            Text("Recommended")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(tint, in: Capsule())
                        }
                    }
                    Text(priceText(for: tier))
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if isCurrent {
                    Text("Current")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                } else {
                    Image(systemName: isSelected ? "largecircle.fill.circle" : "circle")
                        .foregroundStyle(isSelected ? tint : .secondary)
                        .accessibilityHidden(true)
                }
            }
            .padding(14)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(isSelected ? tint : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(tier.displayName), \(priceText(for: tier))\(isSelected ? ", selected" : "")")
    }

    // MARK: Period toggle

    private var periodToggle: some View {
        Picker("Billing period", selection: $selectedPeriod) {
            ForEach(periods) { period in
                Text(period.label).tag(period)
            }
        }
        .pickerStyle(.segmented)
    }

    // MARK: Purchase footer (pinned)

    private var purchaseFooter: some View {
        VStack(spacing: 8) {
            Button(action: { Task { await purchase() } }) {
                Group {
                    if isPurchasing {
                        ProgressView().tint(.white)
                    } else if let product = selectedProduct {
                        Text("Continue — \(product.displayPrice)\(selectedPeriod.shortSuffix)")
                    } else {
                        Text("Continue")
                    }
                }
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(canPurchase ? Color.accentColor : Color.gray, in: RoundedRectangle(cornerRadius: 14))
                .foregroundStyle(.white)
            }
            .disabled(!canPurchase || isPurchasing)
            .accessibilityLabel("Subscribe to \(selectedTier.displayName)")

            Text(autoRenewDisclosure)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            HStack(spacing: 16) {
                Button("Restore") { Task { await restore() } }
                Link("Terms", destination: Config.siteURL.appendingPathComponent("terms"))
                Link("Privacy", destination: Config.siteURL.appendingPathComponent("privacy-policy"))
            }
            .font(.caption.weight(.medium))
        }
        .padding(.horizontal)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background(.bar)
    }

    // MARK: - Derived state

    private var periods: [StoreKitService.SubscriptionPeriod] {
        let available = storeKit.availablePeriods(for: selectedTier)
        return available.isEmpty ? [.monthly] : available
    }

    private var selectedProduct: Product? {
        storeKit.product(for: selectedTier, period: selectedPeriod)
            ?? storeKit.product(for: selectedTier, period: .monthly)
    }

    /// Can't purchase a tier the user already holds (or higher).
    private var canPurchase: Bool {
        selectedProduct != nil && StoreKitService.rank(storeKit.currentTier) < StoreKitService.rank(selectedTier)
    }

    private var autoRenewDisclosure: String {
        "Auto-renewing subscription. Your Apple ID is charged at confirmation. "
            + "It renews automatically unless canceled at least 24 hours before the period ends. "
            + "Manage or cancel anytime in Settings."
    }

    private func priceText(for tier: SubscriptionTier) -> String {
        if let product = storeKit.product(for: tier, period: selectedPeriod)
            ?? storeKit.product(for: tier, period: .monthly) {
            return "\(product.displayPrice)\(selectedPeriod.shortSuffix)"
        }
        // Fallback marketing price if products haven't loaded yet.
        return tier == .vip ? "$12.99/mo" : "$4.99/mo"
    }

    /// Keep the selected period valid when switching tiers (e.g. annual may not
    /// exist for one tier yet).
    private func clampPeriod() {
        if !periods.contains(selectedPeriod) { selectedPeriod = periods.first ?? .monthly }
    }

    // MARK: - Actions

    @MainActor
    private func purchase() async {
        guard let product = selectedProduct else {
            errorMessage = "This plan isn't available right now. Please try again."
            return
        }
        errorMessage = nil
        isPurchasing = true
        analytics.trackPaywallPurchaseStart(context: context.id, productId: product.id)
        do {
            let transaction = try await storeKit.purchase(product)
            isPurchasing = false
            if transaction != nil {
                analytics.trackPaywallPurchaseComplete(context: context.id, productId: product.id)
                didConvert = true
                dismiss()
            }
        } catch {
            isPurchasing = false
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func restore() async {
        analytics.trackPaywallRestore(context: context.id)
        isPurchasing = true
        await storeKit.restorePurchases()
        isPurchasing = false
        if storeKit.currentTier != .free {
            didConvert = true
            dismiss()
        } else {
            errorMessage = "No active subscription found to restore."
        }
    }
}

#Preview {
    PaywallView(context: .tripPlanner)
}
