import SwiftUI

/// Full restaurant detail view — NavigationStack destination with hero image, info, and actions.
struct RestaurantDetailView: View {
    let restaurant: Restaurant

    @State private var showShareSheet = false

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                heroImage
                infoSection
                actionButtons
                descriptionSection
            }
        }
        .ignoresSafeArea(edges: .top)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    showShareSheet = true
                } label: {
                    Image(systemName: "square.and.arrow.up")
                }
                .accessibilityLabel("Share restaurant")
            }
        }
        .sheet(isPresented: $showShareSheet) {
            ShareSheet(items: [shareText])
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
            .frame(height: 300)
            .clipped()

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
