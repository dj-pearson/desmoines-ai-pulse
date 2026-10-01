import SwiftUI

/// Info section: rating, open status, price, address, distance, and description.
///
/// Phone, website and directions moved to RestaurantDetailActions; they were
/// shown twice (IOS-DD-RESTAURANTS-10). The Status row that printed
/// "Opening_Soon" with a green check is replaced by the banner in
/// RestaurantDetailView (IOS-DD-RESTAURANTS-06).
struct RestaurantDetailInfo: View {
    let restaurant: Restaurant

    @State private var aboutExpanded = false

    /// Above this the About text is clamped with a More button.
    private static let aboutClampLength = 240

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
                                    // The half star is yellow too; it was grey.
                                    .foregroundStyle(Double(star) - 0.5 <= rating ? .yellow : .gray.opacity(0.3))
                            }
                        }
                        .accessibilityHidden(true)
                        Text(String(format: "%.1f", rating))
                            .font(.subheadline.weight(.semibold))
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Rated \(String(format: "%.1f", rating)) out of 5")
                }

                if let price = restaurant.priceRange, !price.isEmpty {
                    Text(price)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .accessibilityLabel(Restaurant.spokenPrice(price) ?? price)
                }

                Spacer()

                // Only sponsored rows carry is_featured since 20260902000004;
                // "Featured" called a paid placement an editorial pick
                // (IOS-DD-RESTAURANTS-08).
                if restaurant.isActivelySponsored {
                    Label("Sponsored", systemImage: "megaphone")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }

            // Open status from hours_json, when known and the place is open
            // for business (the banner covers the rest).
            if restaurant.lifecycle == .open || restaurant.lifecycle == .newlyOpened,
               let line = restaurant.openStatus().line {
                HStack(spacing: 10) {
                    Image(systemName: restaurant.openStatus().isOpen ? "clock.badge.checkmark" : "clock.badge.xmark")
                        .font(.title3)
                        .foregroundStyle(restaurant.openStatus().isOpen ? .green : .red)
                        .frame(width: 28)
                        .accessibilityHidden(true)
                    Text(line)
                        .font(.subheadline.weight(.medium))
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
                        .accessibilityHidden(true)

                    Text(restaurant.displayLocation)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
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
                        .accessibilityHidden(true)
                    Text(distance)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            // A number that cannot be dialled (see Restaurant.dialURL) is
            // still worth reading, so it shows here as plain text.
            if let phone = restaurant.phone, !phone.isEmpty, restaurant.callURL == nil {
                HStack(spacing: 10) {
                    Image(systemName: "phone.fill")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                        .frame(width: 28)
                        .accessibilityHidden(true)
                    Text(phone)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
            }
        }
        .padding()

        // Description
        if !restaurant.displayDescription.isEmpty {
            let isLong = restaurant.displayDescription.count > Self.aboutClampLength
            VStack(alignment: .leading, spacing: 10) {
                Text("About")
                    .font(.title3.bold())
                    .accessibilityAddTraits(.isHeader)

                Text(restaurant.displayDescription)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .lineSpacing(4)
                    .lineLimit(isLong && !aboutExpanded ? 4 : nil)

                if isLong {
                    Button(aboutExpanded ? "Less" : "More") {
                        withAnimation(.easeInOut(duration: 0.2)) { aboutExpanded.toggle() }
                    }
                    .font(.subheadline.weight(.semibold))
                    .accessibilityLabel(aboutExpanded ? "Show less" : "Read more about \(restaurant.name)")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
        }
    }
}

#Preview {
    RestaurantDetailInfo(restaurant: .preview)
}
