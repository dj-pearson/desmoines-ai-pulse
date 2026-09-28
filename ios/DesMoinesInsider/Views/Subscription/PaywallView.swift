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
//
// Every line here must describe something iOS actually delivers
// (IOS-DD-MONETIZATION-11/-12). PaywallCopyTests fails on the phrases that
// used to sell features with no implementation.

extension PaywallContext {
    static let unlimitedFavorites = PaywallContext(
        id: "unlimited_favorites",
        icon: "heart.fill",
        headline: "Save everything you love",
        subheadline: "You've reached the free limit of \(SubscriptionTier.free.maxFavorites) saved items. Go Insider for unlimited favorites.",
        benefits: [
            "Unlimited saved events, restaurants & attractions",
            // Was "Sync your saves across all your devices", which free
            // signed-in accounts already get.
            "Keep past favorites without deleting them",
            "Never lose track of a place again",
        ],
        recommendedTier: .insider
    )

    /// Soft nudge while the user is still UNDER the free limit
    /// (IOS-DD-MONETIZATION-13). The soft paywall used to present
    /// `unlimitedFavorites` after the second save, which told the user they
    /// had "reached the free limit of 3".
    static func favoritesProgress(used: Int, limit: Int = SubscriptionTier.free.maxFavorites) -> PaywallContext {
        PaywallContext(
            id: "favorites_soft",
            icon: "heart.fill",
            headline: "Building a list?",
            subheadline: "You've used \(used) of \(limit) free saves. Insider saves are unlimited.",
            benefits: [
                "Unlimited saved events, restaurants & attractions",
                "Plan a whole weekend without clearing old saves",
            ],
            recommendedTier: .insider
        )
    }

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

    /// Ask Pulse's daily question limit (IOS-DD-DISCOVER-14). The numbers are
    /// ai_quota_limits for discover-chat (20261001000001): free 5, insider 50,
    /// vip 200.
    static let askPulse = PaywallContext(
        id: "ask_pulse",
        icon: "sparkles",
        headline: "Ask Pulse more",
        // Tier-neutral: an Insider who hits 50 sees this too, and the
        // tier picker already moves them to VIP.
        subheadline: "Ask Pulse questions reset each night. Free gets 5 a day, Insider 50, VIP 200.",
        benefits: [
            "50 Ask Pulse questions a day on Insider",
            "200 a day on VIP",
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

    /// First-session onboarding upsell (IOS-SUB-013). Presented with annual
    /// preselected so a free trial, when one exists, is the headline moment.
    /// Without an eligible trial the header swaps to
    /// `PaywallView.headline(for:hasTrial:)` (IOS-DD-MONETIZATION-21).
    static let onboarding = PaywallContext(
        id: "onboarding",
        icon: "sparkles",
        headline: "Try Insider free for 7 days",
        subheadline: "Start a free trial and unlock the full Des Moines Insider experience. Cancel anytime.",
        benefits: [
            "Unlimited saved favorites",
            "AI Trip Planner itineraries",
            "Saved searches & event alerts",
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
            "Plus unlimited saves and the AI Trip Planner",
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
    /// Called after a successful purchase or restore, before dismissing, so
    /// the surface that was blocked can resume what the user was doing
    /// (IOS-DD-MONETIZATION-22). Defaulted so existing call sites compile.
    var onPurchased: (() -> Void)?

    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var storeKit = StoreKitService.shared
    @State private var selectedTier: SubscriptionTier
    @State private var selectedPeriod: StoreKitService.SubscriptionPeriod = .monthly
    @State private var isPurchasing = false
    @State private var isRestoring = false
    @State private var errorMessage: String?
    /// Non-error outcomes such as Ask to Buy ("pending approval"), shown in
    /// secondary color rather than red (IOS-DD-MONETIZATION-14).
    @State private var infoMessage: String?
    @State private var showSignIn = false
    /// Set after the first loadProducts finishes, so the "couldn't load
    /// plans" row does not flash on the first frame before loading starts.
    @State private var didAttemptLoad = false
    /// Set once a purchase/restore succeeds so `onDisappear` doesn't log a
    /// "dismiss" (abandon) event on top of the conversion.
    @State private var didConvert = false
    /// Localized "7-day free trial, then …" copy, set only when the selected
    /// product has an intro offer AND the user is eligible (IOS-SUB-012).
    @State private var trialCopy: String?

    private let analytics = AnalyticsService.shared

    init(
        context: PaywallContext,
        preferredPeriod: StoreKitService.SubscriptionPeriod = .monthly,
        onPurchased: (() -> Void)? = nil
    ) {
        self.context = context
        self.onPurchased = onPurchased
        let recommended: SubscriptionTier = context.recommendedTier == .free ? .insider : context.recommendedTier
        _selectedTier = State(initialValue: recommended)
        _selectedPeriod = State(initialValue: preferredPeriod)
    }

    // MARK: Pure helpers (unit-tested in PaywallCopyTests)

    /// Local rank so these helpers stay free of StoreKitService's main-actor
    /// isolation. Same order as `StoreKitService.rank`.
    private static func order(_ tier: SubscriptionTier) -> Int {
        switch tier {
        case .free: return 0
        case .insider: return 1
        case .vip: return 2
        }
    }

    /// The tier to preselect. The paywall used to preselect the recommended
    /// tier even when the user already held it, which left a gray,
    /// unexplained CTA (IOS-DD-MONETIZATION-14). nil means there is nothing
    /// left to buy.
    static func initialTier(recommended: SubscriptionTier, current: SubscriptionTier) -> SubscriptionTier? {
        let target: SubscriptionTier = recommended == .free ? .insider : recommended
        if order(current) < order(target) { return target }
        if order(current) < order(.vip) { return .vip }
        return nil
    }

    /// Onboarding promised "free for 7 days" with no eligible trial
    /// (IOS-DD-MONETIZATION-21).
    static func headline(for context: PaywallContext, hasTrial: Bool) -> String {
        if context.id == PaywallContext.onboarding.id && !hasTrial {
            return "Get more out of Des Moines Insider"
        }
        return context.headline
    }

    static func subheadline(for context: PaywallContext, hasTrial: Bool, currentTier: SubscriptionTier) -> String {
        if context.id == PaywallContext.onboarding.id && !hasTrial {
            return "Unlock the full Des Moines Insider experience. Cancel anytime."
        }
        // An Insider who used the monthly quota is shown VIP, the only
        // answer that helps.
        if context.id == PaywallContext.tripPlanner.id && currentTier == .insider {
            return "You've used all \(SubscriptionTier.insider.maxTripPlansPerMonth) Insider itineraries this month. VIP is unlimited."
        }
        return context.subheadline
    }

    // MARK: Body

    var body: some View {
        NavigationStack {
            scrollContent
                .safeAreaInset(edge: .bottom) { purchaseFooter }
                .navigationTitle("Go Premium")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { closeToolbarItem }
                .task { await initialLoad() }
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
                .sheet(isPresented: $showSignIn) {
                    NavigationStack { AuthView(isModal: true) }
                }
        }
    }

    private var scrollContent: some View {
        ScrollView {
            VStack(spacing: 20) {
                header
                benefitsList
                tierSelector
                if periods.count > 1 { periodToggle }
                productLoadNotice
                messages
                // At accessibility sizes the pinned footer would cover most of
                // the screen, so the fine print scrolls instead
                // (IOS-DD-MONETIZATION-18).
                if dynamicTypeSize.isAccessibilitySize {
                    finePrint
                }
            }
            .padding()
        }
    }

    private var closeToolbarItem: some ToolbarContent {
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

    @MainActor
    private func initialLoad() async {
        if let tier = Self.initialTier(recommended: context.recommendedTier, current: storeKit.currentTier) {
            selectedTier = tier
        }
        await storeKit.loadProducts()
        didAttemptLoad = true
        // Validate the initial preferredPeriod against the periods that
        // actually loaded, so selectedPeriod can't stay .annual while the
        // toggle is hidden and the price falls back to monthly
        // (IOS-AUDIT-UX-028).
        clampPeriod()
        await refreshTrialCopy()
    }

    // MARK: Header

    private var header: some View {
        VStack(spacing: 12) {
            Image(systemName: context.icon)
                .font(.system(size: 44))
                .foregroundStyle(Color.accentColor.gradient)
                .accessibilityHidden(true)

            Text(Self.headline(for: context, hasTrial: trialCopy != nil))
                .font(.title2.bold())
                .multilineTextAlignment(.center)

            Text(Self.subheadline(for: context, hasTrial: trialCopy != nil, currentTier: storeKit.currentTier))
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

    // MARK: Messages

    @ViewBuilder
    private var messages: some View {
        if let errorMessage {
            Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                .font(.caption)
                .foregroundStyle(.red)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        if let infoMessage {
            Label(infoMessage, systemImage: "clock")
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// Products failed to load: say so and offer a retry instead of prices
    /// that silently read as blank (IOS-DD-MONETIZATION-14).
    @ViewBuilder
    private var productLoadNotice: some View {
        if didAttemptLoad && !storeKit.isLoading && storeKit.products.isEmpty {
            HStack(spacing: 10) {
                Image(systemName: "wifi.exclamationmark")
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
                Text("Couldn't load plans. Check your connection.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Button("Retry") {
                    Task {
                        await storeKit.loadProducts()
                        clampPeriod()
                        await refreshTrialCopy()
                    }
                }
                .font(.footnote.weight(.semibold))
            }
            .padding(12)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        }
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
                        if tier == context.recommendedTier && !isCurrent {
                            recommendedBadge(for: tier)
                        }
                    }
                    priceLabel(for: tier)
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
                    .strokeBorder(isSelected && !isCurrent ? tint : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(.plain)
        // A plan the user already holds can't be bought again (IOS-DD-MONETIZATION-14).
        .disabled(isCurrent)
        .accessibilityLabel("\(tier.displayName), \(priceText(for: tier))\(isCurrent ? ", your current plan" : "")")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    /// White on PremiumTokens.urgencyFill (about 4.9:1) rather than system
    /// orange (about 2.2:1) (IOS-DD-MONETIZATION-18).
    private func recommendedBadge(for tier: SubscriptionTier) -> some View {
        Text("Recommended")
            .font(.caption2.weight(.bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(tier == .vip ? Color.purple : PremiumTokens.urgencyFill, in: Capsule())
    }

    @ViewBuilder
    private func priceLabel(for tier: SubscriptionTier) -> some View {
        let text = priceText(for: tier)
        if text.isEmpty && storeKit.isLoading {
            Text("Loading")
                .font(.subheadline.weight(.medium))
                .redacted(reason: .placeholder)
        } else {
            Text(text)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
        }
    }

    // MARK: Period toggle (with annual savings badge — IOS-SUB-012)

    @ViewBuilder
    private var periodToggle: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(spacing: 10) {
                ForEach(periods) { period in
                    periodButton(period)
                }
            }
        } else {
            HStack(spacing: 10) {
                ForEach(periods) { period in
                    periodButton(period)
                }
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
            // Both buttons use the same two-line structure and a minimum height
            // so they stay even; minHeight (not a fixed height) lets large
            // Dynamic Type grow them (IOS-DD-MONETIZATION-18).
            VStack(spacing: 3) {
                Text(period.label)
                    .font(.subheadline.weight(.semibold))
                if let savings {
                    Text("Save \(savings)%")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(PremiumTokens.savingsFill, in: Capsule())
                } else {
                    Text(period == .annual ? "Billed yearly" : "Billed monthly")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(minHeight: 60)
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

            if !AuthService.shared.isAuthenticated {
                signInPrompt
            }

            if isAlreadyTopTier {
                topTierRow
            } else {
                purchaseButton
            }

            if !dynamicTypeSize.isAccessibilitySize {
                finePrint
            }
        }
        .padding(.horizontal)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background(.bar)
    }

    /// Signed-out purchases work on this device only until the user signs
    /// in, so say so, without blocking the purchase (guideline 5.1.1)
    /// (IOS-DD-MONETIZATION-04).
    private var signInPrompt: some View {
        VStack(spacing: 2) {
            Text("Sign in after you subscribe so your plan also works on the website and your other devices.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Sign in") { showSignIn = true }
                .font(.caption.weight(.semibold))
                .frame(minHeight: 44)
        }
    }

    private var purchaseButton: some View {
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
        .disabled(!canPurchase || isBusy)
        .accessibilityLabel(trialCopy != nil ? "Start free trial of \(selectedTier.displayName)" : "Subscribe to \(selectedTier.displayName)")
    }

    /// Already VIP: nothing to buy, so no dead CTA.
    private var topTierRow: some View {
        VStack(spacing: 8) {
            Label("You're on VIP", systemImage: "crown.fill")
                .font(.headline)
                .foregroundStyle(.purple)
            Button("Close") { dismiss() }
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: 44)
        }
    }

    private var finePrint: some View {
        VStack(spacing: 8) {
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
                Group {
                    if isRestoring {
                        ProgressView()
                    } else {
                        Text("Restore Purchases")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Color.accentColor)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 44)
            }
            .disabled(isBusy)
            .accessibilityLabel("Restore previous purchases")

            HStack(spacing: 16) {
                Link("Terms", destination: Config.siteURL.appendingPathComponent("terms"))
                Link("Privacy", destination: Config.siteURL.appendingPathComponent("privacy-policy"))
            }
            .font(.caption.weight(.medium))
            .foregroundStyle(.secondary)
        }
    }

    // MARK: - Derived state

    private var isBusy: Bool { isPurchasing || isRestoring }

    private var isAlreadyTopTier: Bool {
        Self.initialTier(recommended: context.recommendedTier, current: storeKit.currentTier) == nil
    }

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
        infoMessage = nil
        isPurchasing = true
        analytics.trackPaywallPurchaseStart(context: context.id, productId: product.id)
        do {
            let transaction = try await storeKit.purchase(product)
            isPurchasing = false
            if transaction != nil {
                analytics.trackPaywallPurchaseComplete(context: context.id, productId: product.id)
                completeConversion()
            } else if let pending = storeKit.errorMessage {
                // Ask to Buy / SCA: not an error, just not done yet.
                infoMessage = pending
            }
        } catch {
            isPurchasing = false
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func restore() async {
        analytics.trackPaywallRestore(context: context.id)
        errorMessage = nil
        infoMessage = nil
        isRestoring = true
        await storeKit.restorePurchases()
        isRestoring = false
        if storeKit.currentTier != .free {
            completeConversion()
        } else if let storeError = storeKit.errorMessage {
            // A real restore failure (e.g. AppStore.sync network error) — don't
            // mask it as "nothing to restore" (IOS-AUDIT-UX-028).
            errorMessage = storeError
        } else {
            errorMessage = "No active subscription found to restore."
        }
    }

    /// The moment someone pays is the one to acknowledge
    /// (IOS-DD-MONETIZATION-22).
    @MainActor
    private func completeConversion() {
        didConvert = true
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        AppToastCenter.shared.show(.success("Welcome to \(storeKit.currentTier.displayName)"))
        onPurchased?()
        dismiss()
    }
}

#Preview {
    PaywallView(context: .tripPlanner)
}
