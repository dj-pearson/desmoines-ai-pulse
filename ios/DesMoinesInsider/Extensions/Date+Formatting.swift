import Foundation

extension Date {
    /// "Today", "Tomorrow", or "Jan 15"
    var relativeShort: String {
        let calendar = Calendar.current
        if calendar.isDateInToday(self) { return "Today" }
        if calendar.isDateInTomorrow(self) { return "Tomorrow" }
        return formatted(.dateTime.month(.abbreviated).day())
    }

    /// "Today at 7:00 PM" or "Sat, Jan 15 at 7:00 PM"
    var relativeWithTime: String {
        let calendar = Calendar.current
        let time = formatted(.dateTime.hour().minute())
        if calendar.isDateInToday(self) { return "Today at \(time)" }
        if calendar.isDateInTomorrow(self) { return "Tomorrow at \(time)" }
        let date = formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
        return "\(date) at \(time)"
    }

    /// "3 days away", "In 2 weeks"
    var daysAway: String? {
        let calendar = Calendar.current
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: Date()), to: calendar.startOfDay(for: self)).day ?? 0
        if days == 0 { return "Today" }
        if days == 1 { return "Tomorrow" }
        if days < 7 { return "In \(days) days" }
        if days < 14 { return "Next week" }
        if days < 30 { return "In \(days / 7) weeks" }
        return nil
    }

    /// Parse ISO 8601 string to Date
    static func fromISO(_ string: String?) -> Date? {
        guard let string else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: string) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: string)
    }
}
