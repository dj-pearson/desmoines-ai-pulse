import SwiftUI

/// A promotional banner shown to free users in the feed.
///
/// Creative fallback chain — a slot is never empty:
///   1. a real first-party campaign creative (get_active_ads), else
///   2. the hotel affiliate creative, and always
///   3. a house ad promoting the subscription (IOS-ADS-013).
///
/// Tracking (IOS-ADS-011 / IOS-ADS-014): campaign creatives log a viewable
/// impression on appear and a click on tap into `ad_impressions` / `ad_clicks`;
/// house ads log distinct analytics events so fill rate and house conversion are
/// measurable separately from paid inventory.
///
/// Automatically hidden for Insider/VIP subscribers (ad-free experience).
struct AdBannerView: View {
    /// Affiliate creative size to fall back to.
    var affiliatePlacement: AffiliateAdService.Placement = .banner
    /// Campaign placement to query first.
    var campaignPlacement: CampaignAdService.Placement = .belowFold

    @State private var storeKit = StoreKitService.shared
    @State private var showStore = false
    @State private var campaign: CampaignAdService.CampaignCreative?
    @State private var impressionId: String?
    @State private var didLoadCampaign = false
    @State private var browseTarget: AdTarget?
    /// Rotates the house ad among a few messages (IOS-ADS-013), chosen once per
    /// banner instance so it's stable while on screen.
    @State private var house = HouseAdCopy.random()

    private let campaignService = CampaignAdService.shared
    private let tracking = AdTrackingService.shared

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
                houseBanner
            }
            .task {
                guard !didLoadCampaign else { return }
                didLoadCampaign = true
                campaign = await campaignService.creative(for: campaignPlacement)
                if let campaign {
                    impressionId = await tracking.logImpression(
                        campaignId: campaign.campaignId,
                        creativeId: campaign.creativeId,
                        placement: campaignPlacement.rawValue
                    )
                }
                // The house ad below is shown to every free user; log it as fill
                // so house-vs-paid impression share is measurable.
                tracking.logHouseImpression(variant: house.id, placement: campaignPlacement.rawValue)
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
            .sheet(isPresented: $showStore) {
                // Inline subscription store (loads the whole App Store Connect
                // group by group ID). Deliberately NOT PaywallView here: hotfix
                // cf8ddd7 found PaywallView's period toggle drops the Insider
                // annual SKU (its exact product ID doesn't resolve), so the
                // house ad sends the user to the reliable inline store. The
                // contextual angle lives in the rotating house copy instead.
                SubscriptionView()
            }
        }
    }

    // MARK: - Campaign creative (native in-feed card: image + headline + CTA)

    private func campaignCreative(_ creative: CampaignAdService.CampaignCreative) -> some View {
        Button {
            guard let url = creative.targetURL else { return }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            Task {
                await tracking.logClick(
                    campaignId: creative.campaignId,
                    creativeId: creative.creativeId,
                    impressionId: impressionId
                )
            }
            browseTarget = AdTarget(url: url) // in-app browser (Guideline-friendly)
        } label: {
            VStack(alignment: .leading, spacing: 8) {
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

                // Native headline + CTA beneath the creative (IOS-ADS-012).
                if let title = creative.title, !title.isEmpty {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
                if creative.targetURL != nil {
                    HStack(spacing: 4) {
                        Text(creative.ctaText ?? "Learn More")
                            .font(.caption.weight(.bold))
                        Image(systemName: "arrow.up.right")
                            .font(.caption2.weight(.bold))
                    }
                    .foregroundStyle(Color.accentColor)
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(creative.targetURL == nil)
        .accessibilityLabel("\(creative.title ?? "Sponsored") advertisement. \(creative.ctaText ?? "Tap to learn more").")
        .accessibilityAddTraits(.isLink)
    }

    // MARK: - House ad (rotating; opens the contextual paywall)

    private var houseBanner: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: house.icon)
                    .font(.title3)
                    .foregroundStyle(.orange)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 2) {
                    Text(house.headline)
                        .font(.subheadline.weight(.semibold))
                    Text(house.subhead)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                Spacer(minLength: 0)
            }

            Button {
                tracking.logHouseClick(variant: house.id, placement: campaignPlacement.rawValue)
                showStore = true
            } label: {
                Text(house.cta)
                    .font(.caption.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 8))
                    .foregroundStyle(.white)
            }
            .accessibilityLabel(house.cta)
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
    }
}

// MARK: - House ad copy (IOS-ADS-013)

/// A rotating house-ad message (IOS-ADS-013) so unsold ad inventory becomes a
/// conversion surface instead of blank space. The CTA opens the inline
/// subscription store (see the note at the call site for why not PaywallView).
struct HouseAdCopy: Identifiable {
    let id: String
    let icon: String
    let headline: String
    let subhead: String
    let cta: String

    static let all: [HouseAdCopy] = [
        HouseAdCopy(
            id: "ad_free",
            icon: "sparkles",
            headline: "Enjoying Des Moines Insider?",
            subhead: "Go ad-free with Insider — plus AI Trip Planner, advanced filters & unlimited saves.",
            cta: "Remove Ads — Upgrade"
        ),
        HouseAdCopy(
            id: "trip_planner",
            icon: "map.fill",
            headline: "Plan your perfect day",
            subhead: "Let the AI Trip Planner build a Des Moines itinerary in seconds.",
            cta: "Try Trip Planner"
        ),
        HouseAdCopy(
            id: "unlimited_saves",
            icon: "heart.fill",
            headline: "Save everything you love",
            subhead: "Unlimited favorites, synced across all your devices with Insider.",
            cta: "Go Unlimited"
        ),
    ]

    static func random() -> HouseAdCopy { all.randomElement() ?? all[0] }
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
