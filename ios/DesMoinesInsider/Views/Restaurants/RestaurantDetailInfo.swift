import SwiftUI

/// Info section: rating, price, location, distance, phone, website, status, and description.
struct RestaurantDetailInfo: View {
    let restaurant: Restaurant
    let onDirections: () -> Void

    var body: some View {
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
                            onDirections()
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

        // Description
        if !restaurant.displayDescription.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("About")
                    .font(.title3.bold())

                Text(restaurant.displayDescription)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .lineSpacing(4)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
        }
    }
}

#Preview {
    RestaurantDetailInfo(restaurant: .preview, onDirections: {})
}
