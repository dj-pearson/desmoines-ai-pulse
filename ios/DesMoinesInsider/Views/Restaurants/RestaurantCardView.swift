import SwiftUI

/// Compact card for restaurant listings.
struct RestaurantCardView: View {
    let restaurant: Restaurant
    @Binding var toast: ToastMessage?

    @State private var favorites = FavoritesService.shared
    @State private var favoriteBurst = false

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

                    // Favorite button with heart-burst micro-interaction
                    Button {
                        let wasFavorited = favorites.isRestaurantFavorited(restaurant.id)
                        if !wasFavorited {
                            favoriteBurst.toggle()
                        }
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
                        HeartBurstView(
                            isFavorited: favorites.isRestaurantFavorited(restaurant.id),
                            burst: $favoriteBurst
                        ) {
                            Image(systemName: favorites.isRestaurantFavorited(restaurant.id) ? "heart.fill" : "heart")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(favorites.isRestaurantFavorited(restaurant.id) ? .red : .secondary)
                                .frame(width: 24, height: 24)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(favorites.isRestaurantFavorited(restaurant.id) ? "Remove from saved" : "Save restaurant")
                    .accessibilityValue(favorites.isRestaurantFavorited(restaurant.id) ? "Saved" : "Not saved")
                    .accessibilityAddTraits(favorites.isRestaurantFavorited(restaurant.id) ? .isSelected : [])
                    .minHitTarget()
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

                // Location + Open Status
                HStack(spacing: 8) {
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

                    Spacer()

                    if let isOpen = restaurant.isOpenNow() {
                        HStack(spacing: 3) {
                            Circle()
                                .fill(isOpen ? Color.green : Color.red)
                                .frame(width: 6, height: 6)
                            Text(isOpen ? "Open" : "Closed")
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(isOpen ? .green : .red)
                        }
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(isOpen ? "Currently open" : "Currently closed")
                    }
                }
            }
        }
        .padding(12)
        .glassCard(cornerRadius: 16, material: .regularMaterial, elevation: PremiumTokens.elevation4)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(restaurant.name), \(restaurant.cuisine ?? "restaurant"), \(restaurant.ratingText)")
    }
}

#Preview {
    RestaurantCardView(restaurant: .preview)
        .padding()
}
