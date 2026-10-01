import Foundation

/// The itinerary as plain text for the share sheet (IOS-DD-TRIP-PLANNER-07).
///
/// Share used to set `is_public = true` on the server before the user had
/// picked a target, never set it back, and linked to /trips/shared/<code>, a
/// web route that does not exist. Text needs no network, exposes nothing
/// server-side, and reads fine in Messages. ASCII hyphens only.
enum TripShareText {
    static func make(
        title: String,
        startDate: String,
        itemsByDay: [Int: [TripPlanItem]],
        locale: Locale = .autoupdatingCurrent
    ) -> String {
        var lines = [title]
        for day in itemsByDay.keys.sorted() {
            lines.append("")
            lines.append(TripSchedule.dayTitle(day: day, tripStart: startDate, locale: locale))
            for item in itemsByDay[day] ?? [] {
                let time = TripSchedule.timeDisplay(item.startTime, locale: locale) ?? "Time TBA"
                var line = "\(time)  \(item.title ?? "Stop")"
                if let location = item.location?.trimmingCharacters(in: .whitespacesAndNewlines), !location.isEmpty {
                    line += " - \(location)"
                }
                lines.append(line)
            }
        }
        lines.append("")
        lines.append("Times are Des Moines (Central) time.")
        return lines.joined(separator: "\n")
    }
}
