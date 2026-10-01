import SwiftUI

/// A promotional banner shown to free users in the feed.
///
/// Exactly ONE unit per slot (IOS-DD-MONETIZATION-09). Every slot used to
/// stack the campaign or affiliate unit AND a house ad, so each ad position
/// was two ads tall:
///   1. a live first-party campaign creative (get_active_ads), image or
///      text-only, else
///   2. a rotation of the affiliate creative (two slots in three) and a
///      house ad (every third slot, or always when no affiliate is active).
///
/// Tracking (IOS-ADS-011 / IOS-ADS-014): campaign creatives log a viewable
/// impression and a click through track-ad-event; house ads log distinct
/// analytics events so fill rate and house conversion are measurable
/// separately from paid inventory. Frequency capping is server-side
/// (get_active_ads).
///
/// Automatically hidden for Insider/VIP subscribers (ad-free experience).
struct AdBannerView: View {
    /// Affiliate creative size to fall back to.
    var affiliatePlacement: AffiliateAdService.Placement = .banner
    /// Campaign placement to query first.
    var campaignPlacement: CampaignAdService.Placement = .belowFold

    /// Which unit an unsold slot shows.
    enum Fallback: Equatable { case affiliate, house }

    @State private var storeKit = StoreKitService.shared
    @State private var paywallContext: PaywallContext?
    @State private var campaign: CampaignAdService.CampaignCreative?
    @State private var impressionId: String?
    @State private var didLoadCampaign = false
    @State private var browseTarget: AdTarget?
    /// Chosen once, on first appear, so the unit is stable while on screen.
    @State private var fallback: Fallback?
    /// Rotates the house ad among a few messages (IOS-ADS-013), chosen once per
    /// banner instance so it's stable while on screen.
    @State private var house = HouseAdCopy.random()

    private let campaignService = CampaignAdService.shared
    private let tracking = AdTrackingService.shared

    // MARK: Rotation (pure, unit-tested)

    /// House every third unsold slot, affiliate otherwise; house always when
    /// no affiliate partner is live. AffiliateAdService always fills when a
    /// partner exists, so "house only as a fallback" would mean no house ads.
    static func fallbackUnit(ordinal: Int, hasAffiliate: Bool) -> Fallback {
        if !hasAffiliate || ordinal % 3 == 2 { return .house }
        return .affiliate
    }

    @MainActor private static var slotOrdinal = 0

    @MainActor
    static func nextFallback(placement: AffiliateAdService.Placement) -> Fallback {
        defer { slotOrdinal += 1 }
        // Same conditions AffiliateAdBanner renders on, for THIS slot's
        // placement, so an affiliate pick never leaves the slot blank.
        let affiliate = AffiliateAdService.shared
        let hasAffiliate = affiliate.currentPartner != nil
            && affiliate.imageURL(for: placement) != nil
            && affiliate.affiliateURL?.isSafeWebLink == true
        return fallbackUnit(ordinal: slotOrdinal, hasAffiliate: hasAffiliate)
    }

    var body: some View {
        if storeKit.currentTier == .free {
            unit
                .onAppear {
                    if fallback == nil { fallback = Self.nextFallback(placement: affiliatePlacement) }
                }
                .task {
                    guard !didLoadCampaign else { return }
                    didLoadCampaign = true
                    campaign = await campaignService.creative(for: campaignPlacement)
                }
                .sheet(item: $browseTarget) { target in
                    // SFSafariViewController, not a chromeless web view: the
                    // landing page is advertiser-controlled, and the user
                    // should see the address bar (IOS-DD-MONETIZATION-20).
                    SafariView(url: target.url)
                        .ignoresSafeArea()
                }
                .sheet(item: $paywallContext) { context in
                    PaywallView(context: context)
                }
        }
    }

    @ViewBuilder
    private var unit: some View {
        if let campaign, campaign.isRenderable {
            campaignCreative(campaign)
                // Impression counts only on real viewability (≥50% for ≥1s),
                // web parity (IOS-ADS-014).
                .trackAdViewability {
                    Task {
                        impressionId = await tracking.logImpression(
                            campaignId: campaign.campaignId,
                            creativeId: campaign.creativeId,
                            placement: campaignPlacement.rawValue
                        )
                    }
                }
        } else if fallback == .affiliate {
            AffiliateAdBanner(placement: affiliatePlacement)
        } else if fallback == .house {
            houseBanner
                // House fill is logged on viewability too, so house-vs-paid
                // impression share is measured on the same bar (IOS-ADS-014).
                .trackAdViewability {
                    tracking.logHouseImpression(variant: house.id, placement: campaignPlacement.rawValue)
                }
        } else {
            // Before onAppear picks a unit; keeps the appear callback alive.
            Color.clear.frame(height: 1)
        }
    }

    // MARK: - Campaign creative (native in-feed card: image or text + CTA)

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
            browseTarget = AdTarget(url: url)
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                if Self.hasImage(creative) {
                    campaignImage(creative)
                } else {
                    // Text-only creatives are legitimate (isRenderable), and
                    // used to be dropped here for want of an image.
                    adLabel
                }
                campaignText(creative)
            }
            .padding(Self.hasImage(creative) ? 0 : 14)
            .background(
                Self.hasImage(creative) ? Color.clear : Color(.secondarySystemBackground),
                in: RoundedRectangle(cornerRadius: 12)
            )
        }
        .buttonStyle(.plain)
        .disabled(creative.targetURL == nil)
        .accessibilityLabel("\(creative.title ?? "Sponsored") advertisement. \(creative.ctaText ?? "Tap to learn more").")
        .accessibilityAddTraits(.isLink)
    }

    static func hasImage(_ creative: CampaignAdService.CampaignCreative) -> Bool {
        guard let url = creative.imageUrl else { return false }
        return !url.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func campaignImage(_ creative: CampaignAdService.CampaignCreative) -> some View {
        ZStack(alignment: .topLeading) {
            CachedAsyncImage(url: creative.imageUrl) {
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(.systemGray6))
                    .overlay { ProgressView() }
            }
            .aspectRatio(300.0 / 250.0, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .shadow(color: .black.opacity(0.08), radius: 6, x: 0, y: 2)

            adLabel
                .padding(8)
        }
    }

    /// FTC-compliant "Ad" label.
    private var adLabel: some View {
        Text("Ad")
            .font(.system(size: 10, weight: .medium))
            .tracking(0.5)
            .textCase(.uppercase)
            .foregroundStyle(.white.opacity(0.9))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(.black.opacity(0.6), in: RoundedRectangle(cornerRadius: 4))
            .allowsHitTesting(false)
    }

    @ViewBuilder
    private func campaignText(_ creative: CampaignAdService.CampaignCreative) -> some View {
        // Native headline + CTA beneath the creative (IOS-ADS-012).
        if let title = creative.displayTitle {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
        }
        if !Self.hasImage(creative), let desc = creative.description, !desc.isEmpty {
            Text(desc)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(3)
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
                paywallContext = house.context
            } label: {
                Text(house.cta)
                    .font(.caption.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 8))
                    .foregroundStyle(.white)
            }
            .minHitTarget()
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
/// conversion surface instead of blank space. The CTA opens the contextual
/// PaywallView for that message (IOS-DD-MONETIZATION-10). The generic store
/// was used because PaywallView once hid the annual SKU; clampPeriod() has
/// handled a missing SKU since, and the store view did not sync purchases.
/// The copy sold advanced filters (free on iOS) and device sync (free for
/// every signed-in account); AdsMonetizationTests now fails on those phrases.
struct HouseAdCopy: Identifiable {
    let id: String
    let icon: String
    let headline: String
    let subhead: String
    let cta: String
    let context: PaywallContext

    static let all: [HouseAdCopy] = [
        HouseAdCopy(
            id: "ad_free",
            icon: "sparkles",
            headline: "Enjoying Des Moines Insider?",
            subhead: "Go ad-free with Insider, plus the AI Trip Planner and unlimited saves.",
            cta: "Remove ads",
            context: .adFree
        ),
        HouseAdCopy(
            id: "trip_planner",
            icon: "map.fill",
            headline: "Plan your perfect day",
            subhead: "Let the AI Trip Planner build a Des Moines itinerary in seconds.",
            cta: "See Trip Planner plans",
            context: .tripPlanner
        ),
        HouseAdCopy(
            id: "unlimited_saves",
            icon: "heart.fill",
            headline: "Save everything you love",
            subhead: "Save as many events and places as you like with Insider.",
            cta: "Go Unlimited",
            context: .unlimitedFavorites
        ),
    ]

    static func random() -> HouseAdCopy { all.randomElement() ?? all[0] }
}

/// Identifiable URL wrapper so the in-app browser can be presented via
/// `.sheet(item:)`. Server-supplied creative/sponsored URLs flow through here,
/// so the failable initializer enforces the http/https allowlist centrally — a
/// malicious campaign row can't push a non-web scheme into the in-app browser
/// (IOS-AUDIT-SEC-012).
struct AdTarget: Identifiable {
    let id = UUID()
    let url: URL

    init?(url: URL) {
        guard url.isSafeWebLink else {
            AppLogger.nav.warning("Dropped unsafe ad/sponsored target URL (scheme: \(url.scheme ?? "nil"))")
            return nil
        }
        self.url = url
    }
}

#Preview {
    AdBannerView()
        .padding()
}
