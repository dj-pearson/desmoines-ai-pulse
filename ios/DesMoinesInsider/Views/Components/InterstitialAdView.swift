import SwiftUI

// MARK: - IOS-ADS-012 · Interstitial ad
//
// A dismissible full-screen ad shown rarely at a navigation boundary (see
// `InterstitialAdService` for the cap). Free-tier only — the caller gates on
// tier and only presents when a paid campaign creative is actually live.
//
// IOS-DD-MONETIZATION-08: this used to fetch its creative after appearing,
// fade the whole screen (Close included) in once the fetch finished, log a
// billable impression for campaigns it never drew (text-only creatives), and,
// when nothing was sold, turn into a full-screen house paywall selling features
// iOS does not have. Unsold inventory now shows nothing full-screen; the
// caller fetches first and passes the creative in.
//
// Honors Reduce Motion and always offers an immediate Close, so it never
// blocks the user.
struct InterstitialAdView: View {
    let campaign: CampaignAdService.CampaignCreative

    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var impressionId: String?
    @State private var browseTarget: AdTarget?
    @State private var appeared = false

    private let tracking = AdTrackingService.shared

    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()

            VStack(spacing: 20) {
                // Outside any animation: Close is there from the first frame.
                topBar
                Spacer(minLength: 0)
                campaignBody
                    .opacity(appeared || reduceMotion ? 1 : 0)
                    .animation(reduceMotion ? nil : .easeOut(duration: 0.25), value: appeared)
                    // Billed only once the creative is actually on screen.
                    .trackAdViewability {
                        Task {
                            impressionId = await tracking.logImpression(
                                campaignId: campaign.campaignId,
                                creativeId: campaign.creativeId,
                                placement: "interstitial"
                            )
                        }
                    }
                Spacer(minLength: 0)
            }
            .padding()
        }
        .onAppear { appeared = true }
        .sheet(item: $browseTarget) { target in
            // Advertiser landing pages open in Safari with its address bar
            // (IOS-DD-MONETIZATION-20).
            SafariView(url: target.url)
                .ignoresSafeArea()
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
            .minHitTarget()
            .accessibilityLabel("Close ad")
        }
    }

    private var hasImage: Bool {
        guard let url = campaign.imageUrl else { return false }
        return !url.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var campaignBody: some View {
        VStack(spacing: 16) {
            if hasImage {
                CachedAsyncImage(url: campaign.imageUrl) {
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color(.systemGray6))
                        .overlay { ProgressView() }
                }
                .aspectRatio(4.0 / 3.0, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 16))
            }

            if let title = campaign.displayTitle {
                Text(title)
                    .font(hasImage ? .title3.bold() : .title2.bold())
                    .multilineTextAlignment(.center)
            }
            if let desc = campaign.description, !desc.isEmpty {
                Text(desc).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            if let url = campaign.targetURL {
                Button {
                    Task {
                        await tracking.logClick(
                            campaignId: campaign.campaignId,
                            creativeId: campaign.creativeId,
                            impressionId: impressionId
                        )
                    }
                    browseTarget = AdTarget(url: url)
                } label: {
                    ctaLabel(campaign.ctaText ?? "Learn More")
                }
                .accessibilityLabel("\(campaign.title ?? "Sponsored"). \(campaign.ctaText ?? "Learn more")")
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
    InterstitialAdView(campaign: .init(
        campaignId: "c1",
        creativeId: "cr1",
        title: "Sample sponsor",
        description: "A text-only creative.",
        imageUrl: nil,
        linkUrl: "https://example.com",
        ctaText: "Visit"
    ))
}
