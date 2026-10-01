import Foundation

/// Trip dates and stop times in Des Moines time (IOS-DD-TRIP-PLANNER-09/13).
///
/// A trip's days and its stops' times are Des Moines wall-clock values: the
/// server stores `start_date` as a DATE and each stop's `start_time` as a
/// TIME with no zone. Add to Calendar used to build them with the device
/// zone, so a 6pm dinner landed at 7pm on a phone set to Eastern; every stop
/// was 60 minutes whatever its end_time said; a 12:30am stop after a 10pm
/// show was pinned to the morning of the same day. Pure, so all of that is
/// testable without EventKit. Mirrors the group 1 fix in
/// EventDetailViewModel (DesMoinesTime).
enum TripSchedule {

    /// A stop placed on the real timeline.
    struct CalendarWindow: Equatable {
        let item: TripPlanItem
        let start: Date
        let end: Date
    }

    /// Stops before this hour that follow a later stop belong to the next
    /// morning ("after midnight"), not the start of the same day.
    static let lateNightCutoffMinutes = 5 * 60

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = DesMoinesTime.calendar
        f.timeZone = DesMoinesTime.timeZone
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// 00:00 Central on a "yyyy-MM-dd" day (a longer ISO string is cut to
    /// its date), or nil.
    static func tripDay(_ ymd: String) -> Date? {
        dayFormatter.date(from: String(ymd.prefix(10)))
    }

    /// "yyyy-MM-dd" of `date` in Central time.
    static func ymd(_ date: Date) -> String {
        dayFormatter.string(from: date)
    }

    /// Minutes after midnight for "HH:mm" or "HH:mm:ss", or nil.
    static func clockMinutes(_ time: String?) -> Int? {
        guard let time else { return nil }
        let parts = time.split(separator: ":")
        guard parts.count >= 2, parts.count <= 3,
              let h = Int(parts[0]), let m = Int(parts[1]),
              (0..<24).contains(h), (0..<60).contains(m) else { return nil }
        return h * 60 + m
    }

    /// `day` (a Central midnight) plus `dayOffset` days, at `minutes`.
    private static func centralDate(day: Date, dayOffset: Int, minutes: Int) -> Date? {
        let cal = DesMoinesTime.calendar
        guard let shifted = cal.date(byAdding: .day, value: dayOffset, to: day) else { return nil }
        return cal.date(bySettingHour: minutes / 60, minute: minutes % 60, second: 0, of: shifted)
    }

    /// Timed stops placed on the calendar, in trip order. Items are taken in
    /// the order given within each day (the user's reorder is the truth, and
    /// the stored orderIndex goes stale after one), grouped by dayNumber.
    /// Stops without a parseable time are left out; the caller counts them.
    static func calendarWindows(tripStart: Date, items: [TripPlanItem]) -> [CalendarWindow] {
        let ordered = items.enumerated()
            .sorted { ($0.element.dayNumber, $0.offset) < ($1.element.dayNumber, $1.offset) }
            .map { $0.element }

        var windows: [CalendarWindow] = []
        var currentDay: Int?
        var previousMinutes: Int?
        var rolledPastMidnight = false

        for item in ordered {
            if item.dayNumber != currentDay {
                currentDay = item.dayNumber
                previousMinutes = nil
                rolledPastMidnight = false
            }
            guard let minutes = clockMinutes(item.startTime) else { continue }

            if !rolledPastMidnight, let previousMinutes,
               minutes < previousMinutes, minutes < lateNightCutoffMinutes {
                rolledPastMidnight = true
            }
            let startOffset = (item.dayNumber - 1) + (rolledPastMidnight && minutes < lateNightCutoffMinutes ? 1 : 0)
            previousMinutes = minutes

            guard let start = centralDate(day: tripStart, dayOffset: startOffset, minutes: minutes) else { continue }

            var end: Date?
            if let endMinutes = clockMinutes(item.endTime) {
                let endOffset = startOffset + (endMinutes < minutes && endMinutes < lateNightCutoffMinutes ? 1 : 0)
                if let candidate = centralDate(day: tripStart, dayOffset: endOffset, minutes: endMinutes),
                   candidate > start {
                    end = candidate
                }
            }
            let fallback = start.addingTimeInterval(TimeInterval((item.durationMinutes ?? 60) * 60))
            windows.append(CalendarWindow(item: item, start: start, end: end ?? fallback))
        }
        return windows
    }

    // MARK: - Display

    /// "Day 2 - Sun, Oct 4", or "Day 2" when the trip start does not parse.
    static func dayTitle(day: Int, tripStart: String, locale: Locale = .autoupdatingCurrent) -> String {
        guard let start = tripDay(tripStart),
              let date = DesMoinesTime.calendar.date(byAdding: .day, value: day - 1, to: start) else {
            return "Day \(day)"
        }
        let style = DesMoinesTime.style(.dateTime.weekday(.abbreviated).month(.abbreviated).day()).locale(locale)
        return "Day \(day) - \(plain(date.formatted(style)))"
    }

    /// A stop's clock time in the user's 12/24-hour style ("2:30 PM", "14:30").
    static func timeDisplay(_ time: String?, locale: Locale = .autoupdatingCurrent) -> String? {
        guard let minutes = clockMinutes(time),
              let reference = tripDay("2000-01-01"),
              let date = centralDate(day: reference, dayOffset: 0, minutes: minutes) else { return nil }
        let style = DesMoinesTime.style(.dateTime.hour().minute()).locale(locale)
        return plain(date.formatted(style))
    }

    /// "10:30 AM - 11:45 AM", a single time, or nil.
    static func timeRange(start: String?, end: String?, locale: Locale = .autoupdatingCurrent) -> String? {
        let s = timeDisplay(start, locale: locale)
        let e = timeDisplay(end, locale: locale)
        switch (s, e) {
        case let (s?, e?) where s != e: return "\(s) - \(e)"
        case let (s?, _): return s
        default: return nil
        }
    }

    /// Foundation's time styles put U+202F (narrow no-break space) before
    /// AM/PM on iOS 17. It renders as a space and then breaks string
    /// comparison and copied share text, so it is written as a plain space.
    private static func plain(_ s: String) -> String {
        s.replacingOccurrences(of: "\u{202F}", with: " ")
            .replacingOccurrences(of: "\u{00A0}", with: " ")
    }
}
