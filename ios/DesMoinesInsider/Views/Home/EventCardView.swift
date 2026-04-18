import SwiftUI

/// Card component for displaying an event in the list.
struct EventCardView: View {
    let event: Event
    @Binding var toast: ToastMessage?

    @State private var favorites = FavoritesService.shared
    @State private var favoriteBurst = false

    init(event: Event, toast: Binding<ToastMessage?> = .constant(nil)) {
        self.event = event
        self._toast = toast
    }

    // Full VoiceOver description that covers every piece of visible info on the card.
    private var cardAccessibilityLabel: String {
        var parts: [String] = [event.title]
        if let date = event.parsedDate {
            parts.append(date.formatted(.dateTime.weekday(.wide).month(.wide).day().hour().minute()))
        }
        parts.append(event.displayLocation)
        if event.isFree {
            parts.append("Free event")
        } else if let price = event.price, !price.isEmpty {
            parts.append(price)
        }
        if event.isFeatured == true { parts.append("Featured event") }
        if let urgency = event.urgencyLabel { parts.append(urgency) }
        return parts.joined(separator: ". ")
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
                .frame(maxWidth: .infinity, maxHeight: 180)
                .clipped()
                // Decorative — card label provides the full description; hide from VoiceOver
                .accessibilityHidden(true)

                // Overlays
                VStack(alignment: .trailing, spacing: 6) {
                    // Favorite button — separate focusable element inside the card container
                    Button {
                        let wasFavorited = favorites.isFavorited(event.id)
                        if !wasFavorited {
                            favoriteBurst.toggle()
                        }
                        Task {
                            do {
                                try await favorites.toggleFavorite(eventId: event.id)
                                toast = wasFavorited
                                    ? .info("Removed from saved", icon: "heart")
                                    : .success("Saved!", icon: "heart.fill")
                            } catch {
                                toast = .error(error.localizedDescription, icon: "exclamationmark.triangle")
                            }
                        }
                    } label: {
                        HeartBurstView(
                            isFavorited: favorites.isFavorited(event.id),
                            burst: $favoriteBurst
                        ) {
                            Image(systemName: favorites.isFavorited(event.id) ? "heart.fill" : "heart")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(favorites.isFavorited(event.id) ? .red : .white)
                                .frame(width: 36, height: 36)
                                .background(.ultraThinMaterial, in: Circle())
                        }
                    }
                    .accessibilityLabel(
                        favorites.isFavorited(event.id)
                            ? "Remove \(event.title) from saved"
                            : "Save \(event.title)"
                    )

                    Spacer()

                    // Date badge — hidden from VoiceOver; date is in the card label
                    if let date = event.parsedDate {
                        DateBadge(date: date)
                            .accessibilityHidden(true)
                    }
                }
                .padding(10)

                // Category badge — hidden from VoiceOver; category is in card label via title context
                CategoryBadge(category: event.eventCategory)
                    .position(x: 60, y: 14)
                    .accessibilityHidden(true)
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
                        Label(
                            date.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day().hour().minute()),
                            systemImage: "clock"
                        )
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

                // Bottom row: price + urgency.
                // Both price states use an icon-bearing Label so colour is never the
                // only differentiator (Differentiate Without Color Alone).
                HStack {
                    if event.isFree {
                        Label("FREE", systemImage: "ticket")
                            .font(.caption.bold())
                            .foregroundStyle(.green)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Color.green.opacity(0.12), in: Capsule())
                    } else if let price = event.price, !price.isEmpty {
                        Label(price, systemImage: "ticket")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.blue)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Color.blue.opacity(0.1), in: Capsule())
                    }

                    Spacer()

                    if let urgency = event.urgencyLabel {
                        Label(urgency, systemImage: "clock.badge.exclamationmark")
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
        .glassCard(cornerRadius: 18, material: .regularMaterial, elevation: PremiumTokens.elevation4)
        // .contain so VoiceOver can separately focus the favorite button inside
        .accessibilityElement(children: .contain)
        .accessibilityLabel(cardAccessibilityLabel)
    }
}

// MARK: - Date Badge

private struct DateBadge: View {
    let date: Date

    // Scale with the user's preferred text size (Larger Text accessibility feature).
    @ScaledMetric(relativeTo: .caption2) private var labelSize: CGFloat = 9
    @ScaledMetric(relativeTo: .title3)  private var daySize: CGFloat   = 18
    @ScaledMetric private var badgeWidth: CGFloat  = 48
    @ScaledMetric private var badgeHeight: CGFloat = 52

    var body: some View {
        VStack(spacing: 1) {
            Text(date.formatted(.dateTime.weekday(.short)).uppercased())
                .font(.system(size: labelSize, weight: .bold))
                .foregroundStyle(Color.accentColor)

            Text(date.formatted(.dateTime.day()))
                .font(.system(size: daySize, weight: .bold))
                .foregroundStyle(.primary)

            Text(date.formatted(.dateTime.month(.abbreviated)).uppercased())
                .font(.system(size: labelSize, weight: .medium))
                .foregroundStyle(.secondary)
        }
        .frame(width: badgeWidth, height: badgeHeight)
        .background(.ultraThickMaterial, in: RoundedRectangle(cornerRadius: 10))
    }
}

#Preview {
    EventCardView(event: .preview)
        .padding()
}
