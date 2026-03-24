import SwiftUI

/// Location, price, distance, and description sections for an event.
struct EventDetailInfo: View {
    let event: Event

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            locationRow

            Divider()

            priceRow

            distanceRow
        }
        .padding()

        descriptionSection
    }

    // MARK: - Location

    /// Location — grouped so VoiceOver reads venue + address together.
    private var locationRow: some View {
        HStack(spacing: 10) {
            Image(systemName: "mappin.circle.fill")
                .font(.title3)
                .foregroundStyle(.red)
                .frame(width: 28)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                if let venue = event.venue {
                    Text(venue)
                        .font(.subheadline.weight(.semibold))
                }
                if let location = event.location, !location.isEmpty {
                    Text(location)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                if let city = event.city {
                    Text(city)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
            .accessibilityElement(children: .combine)

            Spacer()

            if event.coordinate != nil {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    openInMaps()
                } label: {
                    Image(systemName: "arrow.triangle.turn.up.right.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.blue)
                }
                .accessibilityLabel("Get directions to \(event.venue ?? event.displayLocation)")
            }
        }
    }

    // MARK: - Price

    /// Price — icon + text so colour is not the only differentiator.
    private var priceRow: some View {
        HStack(spacing: 10) {
            Image(systemName: "ticket.fill")
                .font(.title3)
                .foregroundStyle(.green)
                .frame(width: 28)
                .accessibilityHidden(true)

            if event.isFree {
                Label("Free Event", systemImage: "checkmark.seal.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.green)
            } else if let price = event.price {
                Text(price)
                    .font(.subheadline.weight(.semibold))
            } else {
                Text("Price not listed")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Distance

    @ViewBuilder
    private var distanceRow: some View {
        if let coord = event.coordinate,
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
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(distance) away")
        }
    }

    // MARK: - Description

    private var descriptionSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !event.displayDescription.isEmpty {
                Text("About")
                    .font(.title3.bold())

                Text(event.displayDescription)
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
        guard let coord = event.coordinate else { return }
        let url = URL(string: "maps://?daddr=\(coord.latitude),\(coord.longitude)")!
        UIApplication.shared.open(url)
    }
}

#Preview {
    EventDetailInfo(event: .preview)
}
