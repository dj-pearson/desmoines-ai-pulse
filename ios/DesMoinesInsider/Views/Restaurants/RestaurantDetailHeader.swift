import SwiftUI

/// Hero image section with restaurant name, cuisine badge, and image viewer tap.
struct RestaurantDetailHeader: View {
    let restaurant: Restaurant
    @Binding var showImageViewer: Bool

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            CachedAsyncImage(url: restaurant.imageUrl) {
                ZStack {
                    Rectangle()
                        .fill(Color.orange.opacity(0.15).gradient)
                    Image(systemName: "fork.knife")
                        .font(.system(size: 64))
                        .foregroundStyle(.orange.opacity(0.3))
                }
            }
            .frame(maxWidth: .infinity, minHeight: 300, maxHeight: 300)

            // Layered scrim + top-left highlight (mirrors hero header pattern)
            PremiumTokens.imageScrim

            LinearGradient(
                colors: [Color.white.opacity(0.18), .clear],
                startPoint: .topLeading,
                endPoint: .center
            )
            .frame(maxHeight: .infinity, alignment: .top)
            .blendMode(.plusLighter)
            .allowsHitTesting(false)

            VStack(alignment: .leading, spacing: 8) {
                // Cuisine badge
                if let cuisine = restaurant.cuisine {
                    Text(cuisine)
                        .font(.caption.bold())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(.ultraThinMaterial, in: Capsule())
                }

                Text(restaurant.name)
                    .font(.title2.bold())
                    .foregroundStyle(.white)
                    .lineLimit(3)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .glassOverlay(cornerRadius: PremiumTokens.cornerLg, material: .ultraThinMaterial)
            .padding(16)
        }
        .clipped()
        .onTapGesture {
            if restaurant.imageUrl != nil {
                showImageViewer = true
            }
        }
    }
}

#Preview {
    RestaurantDetailHeader(restaurant: .preview, showImageViewer: .constant(false))
}
