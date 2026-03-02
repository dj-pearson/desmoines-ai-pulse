import SwiftUI

/// A compact event row card for the App Clip event list.
struct ClipEventCard: View {
    let event: ClipEventsViewModel.ClipEvent

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Category icon
            categoryIcon
                .frame(width: 44, height: 44)
                .background(categoryColor.opacity(0.15))
                .clipShape(RoundedRectangle(cornerRadius: 10))

            // Details
            VStack(alignment: .leading, spacing: 3) {
                Text(event.title)
                    .font(.subheadline.bold())
                    .lineLimit(2)
                    .foregroundStyle(.primary)

                if let venue = event.venue ?? event.location {
                    Label(venue, systemImage: "mappin")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                HStack(spacing: 8) {
                    Label(event.formattedDate, systemImage: "calendar")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    if let price = event.price, !price.isEmpty {
                        Text(price)
                            .font(.caption.bold())
                            .foregroundStyle(price.lowercased().contains("free") ? .green : .primary)
                    }
                }
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    // MARK: - Helpers

    private var categoryIcon: some View {
        Image(systemName: categorySymbol)
            .font(.title3)
            .foregroundStyle(categoryColor)
    }

    private var categorySymbol: String {
        switch event.category?.lowercased() {
        case "music":             return "music.note"
        case "food", "dining":   return "fork.knife"
        case "arts", "culture":  return "theatermasks"
        case "sports":           return "figure.run"
        case "family", "kids":   return "figure.2.and.child.holdinghands"
        case "outdoors":         return "leaf"
        case "comedy":           return "face.smiling"
        case "nightlife", "bar": return "wineglass"
        default:                 return "calendar.badge.clock"
        }
    }

    private var categoryColor: Color {
        switch event.category?.lowercased() {
        case "music":             return .purple
        case "food", "dining":   return .orange
        case "arts", "culture":  return .pink
        case "sports":           return .green
        case "family", "kids":   return .yellow
        case "outdoors":         return .mint
        case "comedy":           return .indigo
        case "nightlife", "bar": return .red
        default:                 return .blue
        }
    }
}
