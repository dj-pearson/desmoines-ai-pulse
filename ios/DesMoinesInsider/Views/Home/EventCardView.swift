import SwiftUI

/// Card component for displaying an event in the list.
struct EventCardView: View {
    let event: Event
    @Binding var toast: ToastMessage?

    @State private var favorites = FavoritesService.shared

    init(event: Event, toast: Binding<ToastMessage?> = .constant(nil)) {
        self.event = event
        self._toast = toast
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Image
            ZStack(alignment: .topTrailing) {
                CachedAsyncImage(url: event.imageUrl) {
                    ZStack {
                        Rectangle()
                            .fill(event.eventCategory.color.opacity(0.15).gradient)
                        Image(systemName: event.eventCategory.icon)
                            .font(.system(size: 36))
                            .foregroundStyle(event.eventCategory.color.opacity(0.4))
                    }
                }
                .frame(height: 180)
                .clipped()

                // Overlays
                VStack(alignment: .trailing, spacing: 6) {
                    // Favorite button
                    if AuthService.shared.isAuthenticated {
                        Button {
                            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                            let wasFavorited = favorites.isFavorited(event.id)
                            Task {
                                try? await favorites.toggleFavorite(eventId: event.id)
                                toast = wasFavorited
                                    ? .info("Removed from saved", icon: "heart")
                                    : .success("Saved!", icon: "heart.fill")
                            }
                        } label: {
                            Image(systemName: favorites.isFavorited(event.id) ? "heart.fill" : "heart")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(favorites.isFavorited(event.id) ? .red : .white)
                                .frame(width: 36, height: 36)
                                .background(.ultraThinMaterial, in: Circle())
                        }
                        .accessibilityLabel(favorites.isFavorited(event.id) ? "Remove from saved" : "Save event")
                    }

                    Spacer()

                    // Date badge
                    if let date = event.parsedDate {
                        DateBadge(date: date)
                    }
                }
                .padding(10)

                // Category badge
                CategoryBadge(category: event.eventCategory)
                    .position(x: 60, y: 14)
            }

            // Content
            VStack(alignment: .leading, spacing: 8) {
                // Title
                Text(event.title)
                    .font(.headline)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                // Meta info
                HStack(spacing: 12) {
                    if let date = event.parsedDate {
                        Label(date.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day().hour().minute()), systemImage: "clock")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }

                // Location
                Label(event.displayLocation, systemImage: "mappin")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                // Bottom row: price + urgency
                HStack {
                    if event.isFree {
                        Text("FREE")
                            .font(.caption.bold())
                            .foregroundStyle(.green)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Color.green.opacity(0.12), in: Capsule())
                    } else if let price = event.price, !price.isEmpty {
                        Text(price)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.blue)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Color.blue.opacity(0.1), in: Capsule())
                    }

                    Spacer()

                    if let urgency = event.urgencyLabel {
                        Text(urgency)
                            .font(.caption.bold())
                            .foregroundStyle(.orange)
                    }

                    if event.isFeatured == true {
                        Label("Featured", systemImage: "star.fill")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.orange)
                    }
                }
            }
            .padding(14)
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.08), radius: 8, x: 0, y: 2)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(event.title), \(event.displayLocation)")
    }
}

// MARK: - Date Badge

private struct DateBadge: View {
    let date: Date

    var body: some View {
        VStack(spacing: 1) {
            Text(date.formatted(.dateTime.weekday(.short)).uppercased())
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(Color.accentColor)

            Text(date.formatted(.dateTime.day()))
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(.primary)

            Text(date.formatted(.dateTime.month(.abbreviated)).uppercased())
                .font(.system(size: 9, weight: .medium))
                .foregroundStyle(.secondary)
        }
        .frame(width: 48, height: 52)
        .background(.ultraThickMaterial, in: RoundedRectangle(cornerRadius: 10))
    }
}

#Preview {
    EventCardView(event: .preview)
        .padding()
}
