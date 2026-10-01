import SwiftUI

/// Row of time chips (Anytime, Now, Tonight, 6/8/10 PM while ahead, Sat
/// night) that drives MapViewModel.timeChip, plus a pill saying what the
/// selected time shows.
///
/// IOS-DISCOVER-2026-004, rebuilt in Central time for IOS-DD-MAP-07; the chip
/// rules live in MapTimeChip. The row scrolls and each chip is a 44pt target
/// (IOS-DD-MAP-14): it was a fixed HStack of ~28pt capsules.
struct MapTimeSlider: View {
    @Binding var chip: MapTimeChip
    let eventCount: Int
    let restaurantOpenCount: Int
    let restaurantUnknownCount: Int

    // Honor Reduce Motion like the rest of the app (IOS-AUDIT-UX-047).
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let now = Date()
        VStack(spacing: 8) {
            if chip != .anytime {
                let text = Self.pillText(
                    chip: chip, now: now, eventCount: eventCount,
                    openCount: restaurantOpenCount, unknownCount: restaurantUnknownCount
                )
                Text(text)
                    .font(.caption.weight(.semibold))
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(.thinMaterial, in: Capsule())
            }
            chipRow(now: now)
        }
    }

    private func chipRow(now: Date) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(MapTimeChip.available(now: now)) { option in
                    chipButton(option, now: now)
                }
            }
            .padding(.horizontal, 10)
        }
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Time filter")
    }

    private func chipButton(_ option: MapTimeChip, now: Date) -> some View {
        let isActive = option == chip
        let label = option.label(now: now)
        let spoken: String = option == .anytime ? "Any time" : "Show places at \(label)"
        // The selection haptic and the VoiceOver count announcement come from
        // EventMapView's filter-change handler, once for every filter.
        return Button {
            withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) {
                chip = option
            }
        } label: {
            Text(label)
                .font(.footnote.weight(isActive ? .bold : .medium))
                .lineLimit(1)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(
                    Capsule().fill(isActive ? Color.accentColor : Color.secondary.opacity(0.15))
                )
                .foregroundStyle(isActive ? Color.white : Color.primary)
                .minHitTarget()
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(spoken))
        .accessibilityAddTraits(isActive ? .isSelected : [])
    }

    private static let pillStyle = DesMoinesTime.style(.dateTime.hour().minute().weekday(.wide))

    /// "8:00 PM Friday: 12 events · 8 restaurants open · 30 with hours unknown
    /// hidden". Events are filtered by overlap with a window, not by opening
    /// hours, so they are not called "open" (IOS-AUDIT-UX-027).
    static func pillText(chip: MapTimeChip, now: Date, eventCount: Int, openCount: Int, unknownCount: Int) -> String {
        let when = chip.probeTime(now: now).map { $0.formatted(pillStyle) + DesMoinesTime.zoneSuffix(at: $0) }
            ?? chip.label(now: now)
        var parts = [
            "\(eventCount) \(eventCount == 1 ? "event" : "events")",
            "\(openCount) \(openCount == 1 ? "restaurant" : "restaurants") open",
        ]
        if unknownCount > 0 {
            parts.append("\(unknownCount) with hours unknown hidden")
        }
        return "\(when): " + parts.joined(separator: " · ")
    }
}
