import SwiftUI

/// Hero image with category badge, title overlay, and date/time section.
struct EventDetailHeader: View {
    let event: Event
    let onImageTap: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            heroImage
            dateTimeSection
        }
    }

    // MARK: - Hero Image

    private var heroImage: some View {
        ZStack(alignment: .bottomLeading) {
            CachedAsyncImage(url: event.imageUrl) {
                ZStack {
                    Rectangle()
                        .fill(event.eventCategory.color.gradient)
                    Image(systemName: event.eventCategory.icon)
                        .font(.system(size: 64))
                        .foregroundStyle(.white.opacity(0.3))
                }
            }
            .frame(maxWidth: .infinity, minHeight: 300, maxHeight: 300)
            // Decorative — title is in the text overlay below; hide from VoiceOver
            .accessibilityHidden(true)

            // Layered scrim (matches PremiumTokens.imageScrim) + subtle
            // top-left highlight so imagery stays lively while the title
            // underneath stays legible.
            PremiumTokens.imageScrim

            LinearGradient(
                colors: [Color.white.opacity(0.18), .clear],
                startPoint: .topLeading,
                endPoint: .center
            )
            .frame(maxHeight: .infinity, alignment: .top)
            .blendMode(.plusLighter)
            .allowsHitTesting(false)

            // Title overlay on a glass panel for cohesion with list cards
            VStack(alignment: .leading, spacing: 8) {
                CategoryBadge(category: event.eventCategory)

                Text(event.title)
                    .font(.title2.bold())
                    .foregroundStyle(.white)
                    .lineLimit(3)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .glassOverlay(cornerRadius: PremiumTokens.cornerLg, material: .ultraThinMaterial)
            .padding(16)
        }
        // clip the ZStack so neither the image nor overlays can push layout wider than screen
        .clipped()
        .onTapGesture {
            if event.imageUrl != nil {
                onImageTap()
            }
        }
    }

    // MARK: - Date & Time

    /// The day, in Des Moines time (IOS-DD-EVENTS-05).
    private func dayText(_ date: Date) -> String {
        date.formatted(DesMoinesTime.style(.dateTime.weekday(.wide).month(.wide).day().year()))
    }

    /// The start time in Des Moines time, " CT" appended when the phone is on
    /// another zone; "Time TBA" when the row has no real start time, which
    /// used to print as 7:31 PM (the no-time marker) or 3:30 AM (SeatGeek).
    private func timeText(_ date: Date) -> String {
        guard event.hasSpecificTime else { return "Time TBA" }
        return date.formatted(DesMoinesTime.style(.dateTime.hour().minute()))
            + DesMoinesTime.zoneSuffix(at: date)
    }

    @ViewBuilder
    private var dateTimeSection: some View {
        // Date & Time — grouped so VoiceOver reads it as one element
        if let date = event.parsedDate {
            HStack(spacing: 10) {
                Image(systemName: "calendar")
                    .font(.title3)
                    .foregroundStyle(Color.accentColor)
                    .frame(width: 28)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 2) {
                    Text(dayText(date))
                        .font(.subheadline.weight(.semibold))
                    Text(timeText(date))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                // Icon + text so urgency is not conveyed by colour alone
                if let urgency = event.urgencyLabel {
                    Label(urgency, systemImage: "clock.badge.exclamationmark")
                        .font(.caption.bold())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(PremiumTokens.urgencyFill, in: Capsule())
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel({
                var label = dayText(date) + ", " + timeText(date)
                if let urgency = event.urgencyLabel { label += ". \(urgency)" }
                return label
            }())
            .padding([.horizontal, .top])
        }
    }
}

#Preview {
    EventDetailHeader(event: .preview, onImageTap: {})
}
