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

    static let writeReviews = PaywallContext(
        id: "write_reviews",
        icon: "star.bubble.fill",
        headline: "Share your take with the city",
        subheadline: "Write reviews and ratings on events, restaurants, and attractions as an Insider.",
        benefits: [
            "Rate & review any place in Des Moines",
            "Help locals find the best spots",
            "Your reviews, editable anytime",
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

    /// First-session onboarding upsell (IOS-SUB-013). Presented with annual
    /// preselected so the 7-day free trial is the headline moment.
    static let onboarding = PaywallContext(
        id: "onboarding",
        icon: "sparkles",
        headline: "Try Insider free for 7 days",
        subheadline: "Start a free trial and unlock the full Des Moines Insider experience. Cancel anytime.",
        benefits: [
            "Unlimited saved favorites",
            "AI Trip Planner itineraries",
            "Advanced filters & insider tips",
            "Ad-free browsing",
        ],
        recommendedTier: .insider
    )

    /// Win-back upsell for lapsed subscribers (IOS-SUB-014).
    static let winBack = PaywallContext(
        id: "winback",
        icon: "arrow.uturn.backward.circle.fill",
        headline: "We saved your spot",
        subheadline: "Come back to Des Moines Insider and pick up right where you left off.",
        benefits: [
            "Your favorites and saved searches are still here",
            "Unlimited favorites, AI Trip Planner & ad-free",
            "Fresh local events added every day",
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
    /// Localized "7-day free trial, then …" copy, set only when the selected
    /// product has an intro offer AND the user is eligible (IOS-SUB-012).
    @State private var trialCopy: String?

    private let analytics = AnalyticsService.shared

    init(context: PaywallContext, preferredPeriod: StoreKitService.SubscriptionPeriod = .monthly) {
        self.context = context
        let recommended: SubscriptionTier = context.recommendedTier == .free ? .insider : context.recommendedTier
        _selectedTier = State(initialValue: recommended)
        _selectedPeriod = State(initialValue: preferredPeriod)
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
                    // Prominent, labeled close (IOS-AUDIT-UX-011); toolbar items
                    // already satisfy the 44pt hit-target minimum.
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title2)
                            .symbolRenderingMode(.hierarchical)
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityLabel("Close")
                }
            }
            .task {
                await storeKit.loadProducts()
                // Validate the initial preferredPeriod against the periods that
                // actually loaded, so selectedPeriod can't stay .annual while the
                // toggle is hidden and the price falls back to monthly
                // (IOS-AUDIT-UX-028).
                clampPeriod()
                await refreshTrialCopy()
            }
            .onChange(of: selectedTier) { _, _ in
                clampPeriod()
                Task { await refreshTrialCopy() }
            }
            .onChange(of: selectedPeriod) { _, _ in
                Task { await refreshTrialCopy() }
            }
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
        .accessibilityLabel("\(tier.displayName), \(priceText(for: tier))")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    // MARK: Period toggle (with annual savings badge — IOS-SUB-012)

    private var periodToggle: some View {
        HStack(spacing: 10) {
            ForEach(periods) { period in
                periodButton(period)
            }
        }
    }

    private func periodButton(_ period: StoreKitService.SubscriptionPeriod) -> some View {
        let isSelected = selectedPeriod == period
        // Only the annual button carries a savings badge; computing it here keeps
        // the layout decision (badge vs. plain caption) in one place.
        let savings = period == .annual ? annualSavingsPercent : nil
        return Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            selectedPeriod = period
        } label: {
            // Both buttons use the same two-line structure and a fixed height so
            // they stay even regardless of which tier is selected or whether the
            // savings badge is present.
            VStack(spacing: 3) {
                Text(period.label)
                    .font(.subheadline.weight(.semibold))
                if let savings {
                    Text("Save \(savings)%")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Color.green, in: Capsule())
                } else {
                    Text(period == .annual ? "Billed yearly" : "Billed monthly")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 60)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(isSelected ? Color.accentColor : Color.clear, lineWidth: 2)
            )
            .contentShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(period.label)\(savings != nil ? ", save \(savings!) percent" : "")")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    // MARK: Purchase footer (pinned)

    private var purchaseFooter: some View {
        VStack(spacing: 8) {
            if let trialCopy {
                Label(trialCopy, systemImage: "gift.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.green)
                    .multilineTextAlignment(.center)
            }

            Button(action: { Task { await purchase() } }) {
                Group {
                    if isPurchasing {
                        ProgressView().tint(.white)
                    } else if trialCopy != nil {
                        Text("Start Free Trial")
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
            .accessibilityLabel(trialCopy != nil ? "Start free trial of \(selectedTier.displayName)" : "Subscribe to \(selectedTier.displayName)")

            Text(autoRenewDisclosure)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            // Restore is an interactive control — make it distinct from the
            // legal links (accent, bolder, ≥44pt) so it doesn't read as fine
            // print (IOS-AUDIT-UX-011).
            Button {
                Task { await restore() }
            } label: {
                Text("Restore Purchases")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.accentColor)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .accessibilityLabel("Restore previous purchases")

            HStack(spacing: 16) {
                Link("Terms", destination: Config.siteURL.appendingPathComponent("terms"))
                Link("Privacy", destination: Config.siteURL.appendingPathComponent("privacy-policy"))
            }
            .font(.caption.weight(.medium))
            .foregroundStyle(.secondary)
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
        let base = "Auto-renewing subscription. It renews automatically unless canceled at least "
            + "24 hours before the period ends. Manage or cancel anytime in Settings."
        if trialCopy != nil {
            return "Your free trial converts to a paid subscription unless canceled before it ends. "
                + base
        }
        return "Your Apple ID is charged at confirmation. " + base
    }

    /// Annual savings vs paying monthly for a full year, as a whole percent.
    /// Returns nil unless both monthly and annual products are loaded.
    private var annualSavingsPercent: Int? {
        guard let monthly = storeKit.product(for: selectedTier, period: .monthly),
              let annual = storeKit.product(for: selectedTier, period: .annual) else { return nil }
        let monthlyCost = (monthly.price as NSDecimalNumber).doubleValue * 12
        let annualCost = (annual.price as NSDecimalNumber).doubleValue
        guard monthlyCost > 0, annualCost < monthlyCost else { return nil }
        return Int((((monthlyCost - annualCost) / monthlyCost) * 100).rounded())
    }

    private func priceText(for tier: SubscriptionTier) -> String {
        if let product = storeKit.product(for: tier, period: selectedPeriod)
            ?? storeKit.product(for: tier, period: .monthly) {
            return "\(product.displayPrice)\(selectedPeriod.shortSuffix)"
        }
        // No price rather than a marketing one (IOS-AUDIT-FEAT-036). This used
        // to return a hardcoded "$12.99/mo" / "$4.99/mo" while products loaded
        // or when they failed to. Both are USD, so every user outside the US
        // saw a currency they will not be charged in - and a price the user
        // reads and decides on is worse wrong than absent.
        return ""
    }

    /// Keep the selected period valid when switching tiers (e.g. annual may not
    /// exist for one tier yet).
    private func clampPeriod() {
        if !periods.contains(selectedPeriod) { selectedPeriod = periods.first ?? .monthly }
    }

    /// Computes trial copy for the selected product, but ONLY when StoreKit says
    /// the user is eligible (intro offers are one-per-customer). Cleared when
    /// there's no offer or the user has already used theirs (IOS-SUB-012).
    @MainActor
    private func refreshTrialCopy() async {
        guard let product = selectedProduct,
              let sub = product.subscription,
              let offer = sub.introductoryOffer,
              offer.paymentMode == .freeTrial else {
            trialCopy = nil
            return
        }
        let eligible = await sub.isEligibleForIntroOffer
        guard eligible else { trialCopy = nil; return }
        trialCopy = "\(Self.trialLength(offer.period)) free trial, then \(product.displayPrice)\(selectedPeriod.shortSuffix)"
    }

    /// Human-readable intro length, e.g. "7-day", "1-month". Weeks are rendered
    /// in days so a P1W trial reads as the conventional "7-day free trial".
    private static func trialLength(_ period: Product.SubscriptionPeriod) -> String {
        switch period.unit {
        case .day:   return "\(period.value)-day"
        case .week:  return "\(period.value * 7)-day"
        case .month: return "\(period.value)-month"
        case .year:  return "\(period.value)-year"
        @unknown default: return "free"
        }
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
        } else if let storeError = storeKit.errorMessage {
            // A real restore failure (e.g. AppStore.sync network error) — don't
            // mask it as "nothing to restore" (IOS-AUDIT-UX-028).
            errorMessage = storeError
        } else {
            errorMessage = "No active subscription found to restore."
        }
    }
}

#Preview {
    PaywallView(context: .tripPlanner)
}
