import SwiftUI

/// Horizontal time slider with snap stops (Now, 6pm, 8pm, 10pm, this Sat,
/// next Sat). Drives MapViewModel.mapTime so events filter to ±2h of the
/// slider time and restaurants filter to those open at that time.
///
/// IOS-DISCOVER-2026-004.
struct MapTimeSlider: View {
    @Binding var mapTime: Date?
    let eventCount: Int
    let restaurantCount: Int

    // Honor Reduce Motion like the rest of the app (IOS-AUDIT-UX-047).
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 8) {
            // Top pill — count summary for the current slider position
            if mapTime != nil {
                Text(countPillText)
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(.thinMaterial, in: Capsule())
                    .accessibilityLabel(countPillText)
            }

            // Stops row — Now, 6pm, 8pm, 10pm, Sat, next Sat
            HStack(spacing: 6) {
                ForEach(MapTimeSliderStop.stops()) { stop in
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) {
                            mapTime = stop.date
                        }
                    } label: {
                        Text(stop.label)
                            .font(.footnote.weight(isActive(stop) ? .bold : .medium))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(
                                Capsule()
                                    .fill(isActive(stop) ? Color.accentColor : Color.secondary.opacity(0.15)),
                            )
                            .foregroundStyle(isActive(stop) ? .white : .primary)
                    }
                    .accessibilityLabel("Show map at \(stop.label)")
                    .accessibilityAddTraits(isActive(stop) ? .isSelected : [])
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18))
        }
    }

    /// Cached formatter — `countPillText` recomputes on every render while the
    /// slider is dragged, so avoid re-allocating a DateFormatter each time.
    private static let pillTimeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "h:mm a EEEE"
        return f
    }()

    private var countPillText: String {
        guard let mapTime else { return "" }
        // Events are filtered to a window around the slider time (not opening
        // hours), so don't claim they're "open at" it (IOS-AUDIT-UX-027).
        let time = Self.pillTimeFormatter.string(from: mapTime)
        return "\(eventCount) events near \(time) · \(restaurantCount) restaurants open"
    }

    private func isActive(_ stop: MapTimeSliderStop) -> Bool {
        if stop.date == nil { return mapTime == nil }
        guard let stopDate = stop.date, let current = mapTime else { return false }
        return abs(stopDate.timeIntervalSince(current)) < 60 * 30
    }
}

struct MapTimeSliderStop: Identifiable {
    let id: String
    let label: String
    let date: Date?

    static func stops(now: Date = .now) -> [MapTimeSliderStop] {
        var out: [MapTimeSliderStop] = [
            .init(id: "now", label: "Now", date: nil),
        ]
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: now)

        for hour in [18, 20, 22] {
            if let target = calendar.date(byAdding: .hour, value: hour, to: today),
               target > now
            {
                let label: String
                switch hour {
                case 18: label = "6pm"
                case 20: label = "8pm"
                case 22: label = "10pm"
                default: label = "\(hour)"
                }
                out.append(.init(id: "today-\(hour)", label: label, date: target))
            }
        }

        // Find this Saturday + next Saturday at 8pm
        let weekday = calendar.component(.weekday, from: now) // 1=Sun,7=Sat
        let daysToThisSat = (7 - weekday + 7) % 7 // wraps to 7 if today is Sat
        if let thisSat = calendar.date(byAdding: .day, value: daysToThisSat == 0 ? 7 : daysToThisSat, to: today),
           let thisSatEvening = calendar.date(byAdding: .hour, value: 20, to: thisSat)
        {
            out.append(.init(id: "this-sat", label: "this Sat", date: thisSatEvening))
        }
        if let nextSat = calendar.date(byAdding: .day, value: (daysToThisSat == 0 ? 7 : daysToThisSat) + 7, to: today),
           let nextSatEvening = calendar.date(byAdding: .hour, value: 20, to: nextSat)
        {
            out.append(.init(id: "next-sat", label: "next Sat", date: nextSatEvening))
        }

        return out
    }
}
