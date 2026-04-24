import SwiftUI

/// Full restaurant detail view — NavigationStack destination with hero image, info, and actions.
struct RestaurantDetailView: View {
    let restaurant: Restaurant

    @State private var showShareSheet = false
    @State private var showImageViewer = false
    @State private var showSubscription = false
    @State private var favorites = FavoritesService.shared
    @State private var storeKit = StoreKitService.shared

    private var hasPremiumAccess: Bool {
        storeKit.currentTier == .insider || storeKit.currentTier == .vip
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                RestaurantDetailHeader(restaurant: restaurant, showImageViewer: $showImageViewer)
                RestaurantDetailInfo(restaurant: restaurant, onDirections: openInMaps)
                RestaurantDetailActions(restaurant: restaurant, onDirections: openInMaps)

                RestaurantDetailDiningTips(
                    restaurant: restaurant,
                    hasPremiumAccess: hasPremiumAccess,
                    currentTier: storeKit.currentTier,
                    showSubscription: $showSubscription
                )

                AdSlot(.feed)
            }
            .frame(maxWidth: .infinity)
        }
        .ignoresSafeArea(edges: .top)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                HStack(spacing: 12) {
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        showShareSheet = true
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                    }
                    .accessibilityLabel("Share restaurant")

                    Button {
                        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                        Task {
                            try? await favorites.toggleRestaurantFavorite(restaurantId: restaurant.id)
                        }
                    } label: {
                        Image(systemName: favorites.isRestaurantFavorited(restaurant.id) ? "heart.fill" : "heart")
                            .foregroundStyle(favorites.isRestaurantFavorited(restaurant.id) ? .red : .primary)
                    }
                    .accessibilityLabel(favorites.isRestaurantFavorited(restaurant.id) ? "Remove from saved" : "Save restaurant")
                }
            }
        }
        .sheet(isPresented: $showShareSheet) {
            ShareSheet(items: [shareText])
        }
        .fullScreenCover(isPresented: $showImageViewer) {
            FullScreenImageViewer(imageUrl: restaurant.imageUrl, isPresented: $showImageViewer)
        }
        .sheet(isPresented: $showSubscription) {
            SubscriptionView()
        }
    }

    // MARK: - Helpers

    private func openInMaps() {
        guard let coord = restaurant.coordinate else { return }
        let name = restaurant.name.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        let url = URL(string: "maps://?daddr=\(coord.latitude),\(coord.longitude)&q=\(name)")!
        UIApplication.shared.open(url)
    }

    private var shareText: String {
        var text = restaurant.name
        if let cuisine = restaurant.cuisine { text += " (\(cuisine))" }
        text += " - \(restaurant.displayLocation)"
        if let rating = restaurant.rating { text += " \u{2B50} \(String(format: "%.1f", rating))" }
        text += "\n\nFound on Des Moines Insider"
        return text
    }
}

#Preview {
    NavigationStack {
        RestaurantDetailView(restaurant: .preview)
    }
}
