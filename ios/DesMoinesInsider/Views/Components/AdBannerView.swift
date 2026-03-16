import SwiftUI

/// A promotional banner shown to free users in the feed.
/// Automatically hidden for Insider and VIP subscribers (ad-free experience).
struct AdBannerView: View {
    @State private var storeKit = StoreKitService.shared
    @State private var showSubscription = false

    var body: some View {
        if storeKit.currentTier == .free {
            banner
        }
    }

    private var banner: some View {
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
            SubscriptionView()
        }
    }
}

#Preview {
    AdBannerView()
        .padding()
}
