import SwiftUI

/// A promotional banner shown to free users in the feed (IOS-ADS-010).
///
/// Creative fallback chain — a slot is never empty:
///   1. a real first-party campaign creative (get_active_ads), else
///   2. the hotel affiliate creative, and always
///   3. the subscription upgrade prompt (house ad — IOS-ADS-013).
///
/// Automatically hidden for Insider/VIP subscribers (ad-free experience).
struct AdBannerView: View {
    /// Affiliate creative size to fall back to.
    var affiliatePlacement: AffiliateAdService.Placement = .banner
    /// Campaign placement to query first.
    var campaignPlacement: CampaignAdService.Placement = .belowFold

    @State private var storeKit = StoreKitService.shared
    @State private var showSubscription = false
    @State private var campaign: CampaignAdService.CampaignCreative?
    @State private var didLoadCampaign = false
    @State private var browseTarget: AdTarget?

    private let campaignService = CampaignAdService.shared

    var body: some View {
        if storeKit.currentTier == .free {
            VStack(spacing: 12) {
                // 1 + 2: campaign creative if live, otherwise affiliate.
                if let campaign, campaign.imageUrl != nil {
                    campaignCreative(campaign)
                } else {
                    AffiliateAdBanner(placement: affiliatePlacement)
                }

                // 3: house ad — always present, so the slot is never empty.
                upgradeBanner
            }
            .task {
                guard !didLoadCampaign else { return }
                didLoadCampaign = true
                campaign = await campaignService.creative(for: campaignPlacement)
            }
            .sheet(item: $browseTarget) { target in
                NavigationStack {
                    WebViewPage(title: "Sponsored", url: target.url)
                        .toolbar {
                            ToolbarItem(placement: .topBarTrailing) {
                                Button("Done") { browseTarget = nil }
                            }
                        }
                }
            }
        }
    }

    // MARK: - Campaign creative

    private func campaignCreative(_ creative: CampaignAdService.CampaignCreative) -> some View {
        Button {
            guard let url = creative.targetURL else { return }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            browseTarget = AdTarget(url: url) // in-app browser (Guideline-friendly)
        } label: {
            ZStack(alignment: .topLeading) {
                CachedAsyncImage(url: creative.imageUrl) {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(.systemGray6))
                        .overlay { ProgressView() }
                }
                .aspectRatio(300.0 / 250.0, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .shadow(color: .black.opacity(0.08), radius: 6, x: 0, y: 2)

                // FTC-compliant "Ad" label
                Text("Ad")
                    .font(.system(size: 10, weight: .medium))
                    .tracking(0.5)
                    .textCase(.uppercase)
                    .foregroundStyle(.white.opacity(0.9))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(.black.opacity(0.6), in: RoundedRectangle(cornerRadius: 4))
                    .padding(8)
                    .allowsHitTesting(false)
            }
        }
        .buttonStyle(.plain)
        .disabled(creative.targetURL == nil)
        .accessibilityLabel("\(creative.title ?? "Sponsored") advertisement. Tap to learn more.")
        .accessibilityAddTraits(.isLink)
    }

    private var upgradeBanner: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: "sparkles")
                    .font(.title3)
                    .foregroundStyle(.orange)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Enjoying Des Moines Insider?")
                        .font(.subheadline.weight(.semibold))
                    Text("Go ad-free with Insider — plus AI Trip Planner, advanced filters, unlimited saves & more.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                Spacer(minLength: 0)
            }

            Button {
                showSubscription = true
            } label: {
                Text("Remove Ads — Upgrade")
                    .font(.caption.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 8))
                    .foregroundStyle(.white)
            }
            .accessibilityLabel("Upgrade to remove ads and get premium features")
        }
        .padding(14)
        .background(
            LinearGradient(
                colors: [Color.orange.opacity(0.06), Color.accentColor.opacity(0.04)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 14)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.orange.opacity(0.15), lineWidth: 1)
        )
        .sheet(isPresented: $showSubscription) {
            // Present the same inline subscription store used by Settings.
            // It loads every plan in the App Store Connect group (monthly +
            // annual, Insider + VIP) by group ID, so all tiers show inline
            // without the tier/period toggle and without depending on the
            // hardcoded annual product IDs matching App Store Connect exactly.
            SubscriptionView()
        }
    }
}

/// Identifiable URL wrapper so the in-app browser can be presented via
/// `.sheet(item:)`.
struct AdTarget: Identifiable {
    let id = UUID()
    let url: URL
}

#Preview {
    AdBannerView()
        .padding()
}
