import SwiftUI

// MARK: - IOS-SUB-014 · Renewal / win-back banner
//
// A non-intrusive top banner that appears only when the user's subscription
// needs attention — expiring (auto-renew off), billing retry, grace period, or
// lapsed. It deep-links to Apple's subscription management for payment/renewal
// issues, and presents the win-back paywall for lapsed users.
//
// IOS-DD-MONETIZATION-15: dismissal lived in @State, so the banner came back
// every launch; it showed "Your subscription ended" to people entitled through
// the web or Android; `.expired` never aged out; "See offer" promised a
// discount the full-price win-back paywall did not have; and the manage
// action left the app although StoreKit's sheet exists. Dismissal is now
// remembered per state and expiry, and `visibleState` decides what is shown.
struct SubscriptionStatusBanner: View {
    @State private var storeKit = StoreKitService.shared
    @State private var dismissedKey: String?
    @State private var showWinBack = false

    /// Days a lapsed subscription keeps its win-back banner.
    static let expiredBannerDays = 30
    /// How close to expiry an auto-renew-off subscription starts nagging.
    static let expiringSoonDays = 7

    /// Which renewal state, if any, deserves a banner right now. Pure so it
    /// can be tested without StoreKit.
    static func visibleState(
        _ state: StoreKitService.SubscriptionRenewalState,
        expiry: Date?,
        currentTier: SubscriptionTier,
        now: Date = Date()
    ) -> StoreKitService.SubscriptionRenewalState? {
        switch state {
        case .expired:
            // Entitled elsewhere (web, Android): nothing ended for them.
            guard currentTier == .free, let expiry else { return nil }
            let age = now.timeIntervalSince(expiry)
            return age <= Double(expiredBannerDays) * 86_400 ? .expired : nil
        case .expiringSoon:
            guard let expiry else { return nil }
            let remaining = expiry.timeIntervalSince(now)
            return remaining <= Double(expiringSoonDays) * 86_400 ? .expiringSoon : nil
        case .billingRetry, .grace:
            return state
        case .active, .none:
            return nil
        }
    }

    /// UserDefaults key for "dismissed this state for this expiry". A new
    /// expiry (renewal, new lapse) is a new key, so it can show again.
    static func dismissalKey(stateKey: String, expiry: Date?) -> String {
        "renewalBanner.dismissed.\(stateKey).\(Int(expiry?.timeIntervalSince1970 ?? 0))"
    }

    var body: some View {
        if let config = bannerConfig, !isDismissed(config) {
            HStack(spacing: 10) {
                Image(systemName: config.icon)
                    .font(.caption.weight(.semibold))
                    .accessibilityHidden(true)

                Text(config.message)
                    .font(.caption.weight(.medium))
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isStaticText)

                Spacer(minLength: 8)

                Button(config.actionTitle) { performAction(config) }
                    .font(.caption.bold())
                    .buttonStyle(.plain)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(.white.opacity(0.25), in: Capsule())
                    .minHitTarget()

                Button {
                    let key = Self.dismissalKey(stateKey: config.stateKey, expiry: storeKit.renewalExpiryDate)
                    UserDefaults.standard.set(true, forKey: key)
                    dismissedKey = key
                    AnalyticsService.shared.trackRenewalBanner(action: "dismiss", state: config.stateKey)
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption2.weight(.bold))
                }
                .buttonStyle(.plain)
                .minHitTarget()
                .accessibilityLabel("Dismiss")
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity)
            .background(config.color)
            .transition(.move(edge: .top).combined(with: .opacity))
            // Group as a container but keep the message, action and Dismiss button
            // as separate focusable elements (IOS-AUDIT-UX-036). `.combine` here
            // previously flattened the buttons into one unactionable label.
            .accessibilityElement(children: .contain)
            .onAppear {
                AnalyticsService.shared.trackRenewalBanner(action: "shown", state: config.stateKey)
            }
            .sheet(isPresented: $showWinBack) {
                PaywallView(context: .winBack, preferredPeriod: .annual)
            }
        }
    }

    // MARK: - Config per state

    private struct BannerConfig {
        let icon: String
        let message: String
        let actionTitle: String
        let color: Color
        let stateKey: String
        let isWinBack: Bool
    }

    private func isDismissed(_ config: BannerConfig) -> Bool {
        let key = Self.dismissalKey(stateKey: config.stateKey, expiry: storeKit.renewalExpiryDate)
        return dismissedKey == key || UserDefaults.standard.bool(forKey: key)
    }

    /// Billing-retry red darkened so white caption text clears 4.5:1
    /// (IOS-DD-MONETIZATION-18).
    private static let billingRetryFill = Color(red: 0.70, green: 0.11, blue: 0.11)

    private var bannerConfig: BannerConfig? {
        guard let state = Self.visibleState(
            storeKit.renewalState,
            expiry: storeKit.renewalExpiryDate,
            currentTier: storeKit.currentTier
        ) else { return nil }
        switch state {
        case .expiringSoon:
            return BannerConfig(
                icon: "calendar.badge.exclamationmark",
                message: "Your subscription is set to expire. Turn auto-renew back on to keep your perks.",
                actionTitle: "Renew",
                color: PremiumTokens.urgencyFill,
                stateKey: "expiring_soon",
                isWinBack: false
            )
        case .billingRetry:
            return BannerConfig(
                icon: "creditcard.trianglebadge.exclamationmark",
                message: "There was a problem with your payment. Update it to keep your subscription.",
                actionTitle: "Update",
                color: Self.billingRetryFill,
                stateKey: "billing_retry",
                isWinBack: false
            )
        case .grace:
            return BannerConfig(
                icon: "exclamationmark.circle",
                message: "We couldn't renew your subscription. Update payment before access ends.",
                actionTitle: "Update",
                color: PremiumTokens.urgencyFill,
                stateKey: "grace",
                isWinBack: false
            )
        case .expired:
            return BannerConfig(
                icon: "arrow.uturn.backward.circle",
                message: "Your subscription ended. Come back and pick up where you left off.",
                actionTitle: "Resubscribe",
                color: .accentColor,
                stateKey: "expired",
                isWinBack: true
            )
        case .active, .none:
            return nil
        }
    }

    private func performAction(_ config: BannerConfig) {
        AnalyticsService.shared.trackRenewalBanner(action: "tap", state: config.stateKey)
        if config.isWinBack {
            showWinBack = true
        } else {
            Task { await storeKit.showManageSubscriptions() }
        }
    }
}

#Preview {
    SubscriptionStatusBanner()
}
