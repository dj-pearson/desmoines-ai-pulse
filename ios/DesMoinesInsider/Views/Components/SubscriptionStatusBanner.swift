import SwiftUI

// MARK: - IOS-SUB-014 · Renewal / win-back banner
//
// A non-intrusive top banner that appears only when the user's subscription
// needs attention — expiring (auto-renew off), billing retry, grace period, or
// lapsed. It deep-links to Apple's subscription management for payment/renewal
// issues, and presents the win-back paywall for lapsed users. Dismissible for
// the session so it never nags.
struct SubscriptionStatusBanner: View {
    @State private var storeKit = StoreKitService.shared
    @State private var dismissedState: StoreKitService.SubscriptionRenewalState?
    @State private var showWinBack = false
    @Environment(\.openURL) private var openURL

    /// Apple's canonical subscription-management deep link.
    private let manageURL = URL(string: "https://apps.apple.com/account/subscriptions")!

    var body: some View {
        if let config = bannerConfig, dismissedState != storeKit.renewalState {
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

                Button {
                    dismissedState = storeKit.renewalState
                    AnalyticsService.shared.trackRenewalBanner(action: "dismiss", state: config.stateKey)
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption2.weight(.bold))
                }
                .buttonStyle(.plain)
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

    private var bannerConfig: BannerConfig? {
        switch storeKit.renewalState {
        case .expiringSoon:
            return BannerConfig(
                icon: "calendar.badge.exclamationmark",
                message: "Your subscription is set to expire. Turn auto-renew back on to keep your perks.",
                actionTitle: "Renew",
                color: .orange,
                stateKey: "expiring_soon",
                isWinBack: false
            )
        case .billingRetry:
            return BannerConfig(
                icon: "creditcard.trianglebadge.exclamationmark",
                message: "There was a problem with your payment. Update it to keep your subscription.",
                actionTitle: "Update",
                color: .red,
                stateKey: "billing_retry",
                isWinBack: false
            )
        case .grace:
            return BannerConfig(
                icon: "exclamationmark.circle",
                message: "We couldn't renew your subscription. Update payment before access ends.",
                actionTitle: "Update",
                color: .orange,
                stateKey: "grace",
                isWinBack: false
            )
        case .expired:
            return BannerConfig(
                icon: "arrow.uturn.backward.circle",
                message: "Your subscription ended. Come back and pick up where you left off.",
                actionTitle: "See offer",
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
            openURL(manageURL)
        }
    }
}

#Preview {
    SubscriptionStatusBanner()
}
