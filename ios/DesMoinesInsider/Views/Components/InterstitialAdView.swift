import SwiftUI

// MARK: - IOS-ADS-012 · Interstitial ad
//
// A dismissible full-screen promo shown rarely at a navigation boundary (see
// `InterstitialAdService` for the cap). Free-tier only — the caller gates on
// tier. Shows a live campaign creative when one is available, otherwise a house
// ad promoting Insider, so it always doubles as a conversion surface
// (IOS-ADS-013). Honors Reduce Motion and always offers an immediate Close, so
// it never blocks the user.
struct InterstitialAdView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var campaign: CampaignAdService.CampaignCreative?
    @State private var impressionId: String?
    @State private var showStore = false
    @State private var browseTarget: AdTarget?
    @State private var didLoad = false
    @State private var appeared = false

    private let tracking = AdTrackingService.shared

    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()

            VStack(spacing: 20) {
                topBar
                Spacer(minLength: 0)
                if let campaign, campaign.imageUrl != nil {
                    campaignBody(campaign)
                } else {
                    houseBody
                }
                Spacer(minLength: 0)
            }
            .padding()
            .opacity(appeared || reduceMotion ? 1 : 0)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.25), value: appeared)
        }
        .task {
            guard !didLoad else { return }
            didLoad = true
            campaign = await CampaignAdService.shared.creative(for: .featuredSpot)
            if let campaign {
                impressionId = await tracking.logImpression(
                    campaignId: campaign.campaignId,
                    creativeId: campaign.creativeId,
                    placement: "interstitial"
                )
            } else {
                tracking.logHouseImpression(variant: "interstitial_upgrade", placement: "interstitial")
            }
            appeared = true
        }
        // Inline store rather than PaywallView — see hotfix cf8ddd7 (PaywallView
        // drops the Insider annual SKU from its period toggle).
        .sheet(isPresented: $showStore) { SubscriptionView() }
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

    private var topBar: some View {
        HStack {
            Text("Ad")
                .font(.caption2.weight(.bold))
                .textCase(.uppercase)
                .tracking(0.5)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(Color(.secondarySystemBackground), in: Capsule())
            Spacer()
            Button { dismiss() } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title2)
                    .foregroundStyle(.secondary)
            }
            .accessibilityLabel("Close ad")
        }
    }

    private func campaignBody(_ creative: CampaignAdService.CampaignCreative) -> some View {
        VStack(spacing: 16) {
            CachedAsyncImage(url: creative.imageUrl) {
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color(.systemGray6))
                    .overlay { ProgressView() }
            }
            .aspectRatio(4.0 / 3.0, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 16))

            if let title = creative.title, !title.isEmpty {
                Text(title).font(.title3.bold()).multilineTextAlignment(.center)
            }
            if let desc = creative.description, !desc.isEmpty {
                Text(desc).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            if let url = creative.targetURL {
                Button {
                    Task {
                        await tracking.logClick(
                            campaignId: creative.campaignId,
                            creativeId: creative.creativeId,
                            impressionId: impressionId
                        )
                    }
                    browseTarget = AdTarget(url: url)
                } label: {
                    ctaLabel(creative.ctaText ?? "Learn More")
                }
                .accessibilityLabel("\(creative.title ?? "Sponsored"). \(creative.ctaText ?? "Learn more")")
            }
        }
    }

    private var houseBody: some View {
        VStack(spacing: 16) {
            Image(systemName: "sparkles")
                .font(.system(size: 52))
                .foregroundStyle(Color.accentColor.gradient)
                .accessibilityHidden(true)
            Text("Go ad-free with Insider")
                .font(.title2.bold())
                .multilineTextAlignment(.center)
            Text("Remove ads and unlock the AI Trip Planner, advanced filters, unlimited saves and insider tips.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button {
                tracking.logHouseClick(variant: "interstitial_upgrade", placement: "interstitial")
                showStore = true
            } label: {
                ctaLabel("See Plans")
            }
        }
    }

    private func ctaLabel(_ text: String) -> some View {
        Text(text)
            .font(.headline)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 14))
            .foregroundStyle(.white)
    }
}

#Preview {
    InterstitialAdView()
}
