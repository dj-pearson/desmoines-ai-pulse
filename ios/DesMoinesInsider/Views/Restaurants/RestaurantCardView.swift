import SwiftUI

/// Compact card for restaurant listings.
struct RestaurantCardView: View {
    let restaurant: Restaurant
    @Binding var toast: ToastMessage?

    @State private var favorites = FavoritesService.shared

    init(restaurant: Restaurant, toast: Binding<ToastMessage?> = .constant(nil)) {
        self.restaurant = restaurant
        self._toast = toast
    }

    var body: some View {
        HStack(spacing: 14) {
            // Image
            CachedAsyncImage(url: restaurant.imageUrl) {
                ZStack {
                    Rectangle().fill(Color.orange.opacity(0.1))
                    Image(systemName: "fork.knife")
                        .foregroundStyle(.orange.opacity(0.4))
                }
            }
            .frame(width: 100, height: 100)
            .clipShape(RoundedRectangle(cornerRadius: 12))

            // Content
            VStack(alignment: .leading, spacing: 6) {
                // Name + Favorite
                HStack {
                    Text(restaurant.name)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)

                    Spacer()

                    // Favorite button
                    Button {
                        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                        let wasFavorited = favorites.isRestaurantFavorited(restaurant.id)
                        Task {
                            do {
                                try await favorites.toggleRestaurantFavorite(restaurantId: restaurant.id)
                                toast = wasFavorited
                                    ? .info("Removed from saved", icon: "heart")
                                    : .success("Saved!", icon: "heart.fill")
                            } catch {
                                toast = .error(error.localizedDescription, icon: "exclamationmark.triangle")
                            }
                        }
                    } label: {
                        Image(systemName: favorites.isRestaurantFavorited(restaurant.id) ? "heart.fill" : "heart")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(favorites.isRestaurantFavorited(restaurant.id) ? .red : .secondary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(favorites.isRestaurantFavorited(restaurant.id) ? "Remove from saved" : "Save restaurant")
                }

                // Cuisine & Price
                HStack(spacing: 8) {
                    if let cuisine = restaurant.cuisine {
                        Text(cuisine)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    if let price = restaurant.priceRange {
                        Text(price)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.green)
                    }
                }

                // Rating
                if let rating = restaurant.rating {
                    HStack(spacing: 3) {
                        ForEach(1...5, id: \.self) { star in
                            Image(systemName: Double(star) <= rating ? "star.fill" : (Double(star) - 0.5 <= rating ? "star.leadinghalf.filled" : "star"))
                                .font(.system(size: 10))
                                .foregroundStyle(Double(star) <= rating ? .yellow : .gray.opacity(0.3))
                        }
                        Text(String(format: "%.1f", rating))
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(.secondary)
                    }
                }

                // Location
                if !restaurant.displayLocation.isEmpty {
                    HStack(spacing: 4) {
                        Image(systemName: "mappin")
                            .font(.system(size: 9))
                        Text(restaurant.displayLocation)
                            .font(.caption2)
                    }
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
                }
            }
        }
        .padding(10)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.06), radius: 6, x: 0, y: 2)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(restaurant.name), \(restaurant.cuisine ?? "restaurant"), \(restaurant.ratingText)")
    }
}

#Preview {
    RestaurantCardView(restaurant: .preview)
        .padding()
}
