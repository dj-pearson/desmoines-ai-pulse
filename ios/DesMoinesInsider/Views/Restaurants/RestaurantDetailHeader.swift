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

            LinearGradient(
                colors: [.clear, .clear, .black.opacity(0.7)],
                startPoint: .top,
                endPoint: .bottom
            )

            VStack(alignment: .leading, spacing: 6) {
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
            .padding()
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
