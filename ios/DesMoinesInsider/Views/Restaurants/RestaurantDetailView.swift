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
                heroImage
                infoSection
                actionButtons
                descriptionSection

                // Insider Dining Tip
                insiderDiningTip

                // Ad banner for free users
                AdBannerView()
                    .padding(.horizontal)
                    .padding(.vertical, 8)
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

    // MARK: - Hero Image

    private var heroImage: some View {
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

    // MARK: - Info Section

    private var infoSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Rating & Price
            HStack(spacing: 16) {
                if let rating = restaurant.rating {
                    HStack(spacing: 6) {
                        HStack(spacing: 2) {
                            ForEach(1...5, id: \.self) { star in
                                Image(systemName: Double(star) <= rating ? "star.fill" : (Double(star) - 0.5 <= rating ? "star.leadinghalf.filled" : "star"))
                                    .font(.system(size: 14))
                                    .foregroundStyle(Double(star) <= rating ? .yellow : .gray.opacity(0.3))
                            }
                        }
                        Text(String(format: "%.1f", rating))
                            .font(.subheadline.weight(.semibold))
                    }
                }

                if let price = restaurant.priceRange {
                    Text(price)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.green)
                }

                Spacer()

                if restaurant.isFeatured == true {
                    Label("Featured", systemImage: "star.fill")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.orange)
                }
            }

            Divider()

            // Location
            if !restaurant.displayLocation.isEmpty {
                HStack(spacing: 10) {
                    Image(systemName: "mappin.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.red)
                        .frame(width: 28)

                    Text(restaurant.displayLocation)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    Spacer()

                    if restaurant.coordinate != nil {
                        Button {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            openInMaps()
                        } label: {
                            Image(systemName: "arrow.triangle.turn.up.right.circle.fill")
                                .font(.title2)
                                .foregroundStyle(.blue)
                        }
                        .accessibilityLabel("Get directions")
                    }
                }
            }

            // Distance
            if let coord = restaurant.coordinate,
               let distance = LocationService.shared.formattedDistance(from: coord) {
                HStack(spacing: 10) {
                    Image(systemName: "location.fill")
                        .font(.title3)
                        .foregroundStyle(.blue)
                        .frame(width: 28)
                    Text(distance)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            // Phone
            if let phone = restaurant.phone, !phone.isEmpty {
                Divider()
                HStack(spacing: 10) {
                    Image(systemName: "phone.fill")
                        .font(.title3)
                        .foregroundStyle(.green)
                        .frame(width: 28)

                    if let url = restaurant.callURL {
                        Link(phone, destination: url)
                            .font(.subheadline)
                    } else {
                        Text(phone)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            // Website
            if let url = restaurant.websiteURL {
                HStack(spacing: 10) {
                    Image(systemName: "safari")
                        .font(.title3)
                        .foregroundStyle(Color.accentColor)
                        .frame(width: 28)

                    Link("Visit Website", destination: url)
                        .font(.subheadline)
                }
            }

            // Status
            if let status = restaurant.status, !status.isEmpty {
                Divider()
                HStack(spacing: 10) {
                    Image(systemName: status.lowercased().contains("open") ? "checkmark.circle.fill" : "info.circle.fill")
                        .font(.title3)
                        .foregroundStyle(status.lowercased().contains("open") ? .green : .secondary)
                        .frame(width: 28)

                    Text(status.capitalized)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding()
    }

    // MARK: - Action Buttons

    private var actionButtons: some View {
        HStack(spacing: 12) {
            if let callURL = restaurant.callURL {
                Link(destination: callURL) {
                    Label("Call", systemImage: "phone.fill")
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.green, in: RoundedRectangle(cornerRadius: 12))
                        .foregroundStyle(.white)
                }
                .accessibilityLabel("Call \(restaurant.name)")
            }

            if let websiteURL = restaurant.websiteURL {
                Link(destination: websiteURL) {
                    Label("Website", systemImage: "safari")
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color(.systemGray5), in: RoundedRectangle(cornerRadius: 12))
                        .foregroundStyle(.primary)
                }
                .accessibilityLabel("Visit \(restaurant.name) website")
            }

            if restaurant.coordinate != nil {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    openInMaps()
                } label: {
                    Label("Directions", systemImage: "map.fill")
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.blue, in: RoundedRectangle(cornerRadius: 12))
                        .foregroundStyle(.white)
                }
                .accessibilityLabel("Get directions to \(restaurant.name)")
            }
        }
        .padding(.horizontal)
    }

    // MARK: - Description

    private var descriptionSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !restaurant.displayDescription.isEmpty {
                Text("About")
                    .font(.title3.bold())

                Text(restaurant.displayDescription)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .lineSpacing(4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
    }

    // MARK: - Insider Dining Tip (Premium Content)

    @ViewBuilder
    private var insiderDiningTip: some View {
        if hasPremiumAccess {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: "star.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.orange)
                    Text("Insider Dining Tip")
                        .font(.headline)
                        .foregroundStyle(.orange)
                    Spacer()
                    PremiumBadge(tier: storeKit.currentTier == .vip ? .vip : .insider)
                }

                Text(diningTipText)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineSpacing(3)
            }
            .padding()
            .background(Color.orange.opacity(0.06), in: RoundedRectangle(cornerRadius: 16))
            .padding(.horizontal)
            .padding(.top, 8)
        } else {
            Button {
                showSubscription = true
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "lock.fill")
                        .font(.subheadline)
                        .foregroundStyle(.orange)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Insider Dining Tips")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                        Text("Upgrade to see exclusive recommendations for this restaurant")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                .padding(14)
                .background(Color.orange.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(Color.orange.opacity(0.15), lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
            .padding(.horizontal)
            .padding(.top, 8)
            .accessibilityLabel("Unlock Insider Dining Tips by upgrading to a premium plan")
        }
    }

    /// Generates a contextual dining tip based on restaurant attributes.
    private var diningTipText: String {
        var tips: [String] = []

        if let price = restaurant.priceRange {
            switch price {
            case "$":
                tips.append("Great value spot! Perfect for a casual meal without breaking the bank.")
            case "$$":
                tips.append("Moderately priced with generous portions — a solid pick for date night or group dinners.")
            case "$$$":
                tips.append("Upscale dining experience. Reservations recommended, especially on weekends.")
            case "$$$$":
                tips.append("Fine dining at its best. Consider the tasting menu for the full experience.")
            default:
                break
            }
        }

        if let cuisine = restaurant.cuisine {
            let lower = cuisine.lowercased()
            if lower.contains("italian") || lower.contains("pizza") {
                tips.append("Ask about daily pasta specials — they're often not on the menu.")
            } else if lower.contains("mexican") || lower.contains("taco") {
                tips.append("Try the house salsa and ask if they have off-menu specials.")
            } else if lower.contains("bbq") || lower.contains("barbecue") {
                tips.append("Get there early — the best cuts sell out fast!")
            } else if lower.contains("asian") || lower.contains("sushi") || lower.contains("chinese") || lower.contains("thai") {
                tips.append("Don't skip the appetizers — they're often the hidden gems here.")
            } else if lower.contains("breakfast") || lower.contains("brunch") {
                tips.append("Weekend brunch gets busy. Arrive before 10 AM or expect a wait.")
            }
        }

        if tips.isEmpty {
            tips.append("Local favorite! Ask your server for their personal recommendation — you won't be disappointed.")
        }

        return tips.joined(separator: " ")
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
        if let cuisine = restaurant.cuisine {
            text += " (\(cuisine))"
        }
        text += " - \(restaurant.displayLocation)"
        if let rating = restaurant.rating {
            text += " \u{2B50} \(String(format: "%.1f", rating))"
        }
        text += "\n\nFound on Des Moines Insider"
        return text
    }
}

#Preview {
    NavigationStack {
        RestaurantDetailView(restaurant: .preview)
    }
}
