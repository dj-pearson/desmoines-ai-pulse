import SwiftUI

/// Displays an affiliate hotel ad creative for free-tier users.
/// Automatically hidden for Insider/VIP subscribers (ad-free experience).
/// Shows the same brand across all instances during a 30-minute session window.
struct AffiliateAdBanner: View {
    var placement: AffiliateAdService.Placement = .banner

    @State private var storeKit = StoreKitService.shared
    @State private var affiliateService = AffiliateAdService.shared

    var body: some View {
        // Only show to free-tier users
        if storeKit.currentTier == .free,
           let partner = affiliateService.currentPartner,
           let imageURL = affiliateService.imageURL(for: placement),
           let affiliateURL = affiliateService.affiliateURL {
            adContent(partner: partner, imageURL: imageURL, affiliateURL: affiliateURL)
        }
    }

    private func adContent(
        partner: AffiliateAdService.AffiliatePartner,
        imageURL: URL,
        affiliateURL: URL
    ) -> some View {
        ZStack(alignment: .topLeading) {
            Link(destination: affiliateURL) {
                CachedAsyncImage(url: imageURL) {
                    // Placeholder while loading
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(.systemGray6))
                        .overlay {
                            ProgressView()
                        }
                }
                .aspectRatio(aspectRatio, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .shadow(color: .black.opacity(0.08), radius: 6, x: 0, y: 2)
            }
            .accessibilityLabel("\(partner.name) hotel advertisement. Tap to learn more.")
            .accessibilityAddTraits(.isLink)

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

    private var aspectRatio: CGFloat {
        switch placement {
        case .banner:  return 300.0 / 250.0  // 1.2:1
        case .compact: return 728.0 / 90.0   // ~8:1
        }
    }
}

#Preview("Banner Placement") {
    AffiliateAdBanner(placement: .banner)
        .padding()
}

#Preview("Compact Placement") {
    AffiliateAdBanner(placement: .compact)
        .padding()
}
