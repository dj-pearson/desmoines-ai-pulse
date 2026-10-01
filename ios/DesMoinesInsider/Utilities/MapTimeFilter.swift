import Foundation

/// The map's time filter, in Des Moines time (IOS-DD-MAP-07).
///
/// It replaces MapTimeSliderStop, which built its stops from
/// `Calendar.current` with `date(byAdding: .hour, value: 18, to: startOfDay)`
/// (an hour off on DST days and wrong on a phone outside Central), treated
/// "Now" as no filter at all, sent "this Sat" to next week on a Saturday, and
/// matched an event only when its start fell within two hours of the stop, so
/// a show already under way or a three-day festival never matched.
///
/// Every window is built with `calendar.date(bySettingHour:minute:second:of:)`
/// on DesMoinesTime.calendar, so 8 PM is 8 PM Central on any phone and on the
/// days the clocks change.
enum MapTimeChip: String, CaseIterable, Identifiable {
    case anytime, now, tonight, at6pm, at8pm, at10pm, saturday

    var id: String { rawValue }

    /// The hour of an "at" chip, nil for the others.
    var hour: Int? {
        switch self {
        case .at6pm: return 18
        case .at8pm: return 20
        case .at10pm: return 22
        case .anytime, .now, .tonight, .saturday: return nil
        }
    }

    /// The chips worth offering at `now`: an hour chip only while that hour
    /// is still ahead today.
    static func available(now: Date, calendar: Calendar = DesMoinesTime.calendar) -> [MapTimeChip] {
        allCases.filter { chip in
            guard let hour = chip.hour else { return true }
            guard let at = calendar.date(bySettingHour: hour, minute: 0, second: 0, of: now) else { return false }
            return at > now
        }
    }

    /// Start of the Saturday the chip means: today on a Saturday until 22:00,
    /// then next Saturday; otherwise the coming one.
    static func targetSaturday(now: Date, calendar: Calendar = DesMoinesTime.calendar) -> Date {
        let today = calendar.startOfDay(for: now)
        let weekday = calendar.component(.weekday, from: now) // 1 = Sun ... 7 = Sat
        let days: Int
        if weekday == 7 {
            days = calendar.component(.hour, from: now) >= 22 ? 7 : 0
        } else {
            days = 7 - weekday
        }
        return calendar.date(byAdding: .day, value: days, to: today) ?? today
    }

    func label(now: Date, calendar: Calendar = DesMoinesTime.calendar) -> String {
        switch self {
        case .anytime: return "Anytime"
        case .now: return "Now"
        case .tonight: return "Tonight"
        case .at6pm: return "6 PM"
        case .at8pm: return "8 PM"
        case .at10pm: return "10 PM"
        case .saturday:
            guard calendar.component(.weekday, from: now) == 7 else { return "Sat night" }
            return calendar.component(.hour, from: now) >= 22 ? "Next Sat" : "This Sat"
        }
    }

    /// The span of time the chip selects, or nil for no filter.
    func window(now: Date, calendar: Calendar = DesMoinesTime.calendar) -> DateInterval? {
        switch self {
        case .anytime:
            return nil
        case .now:
            return DateInterval(start: now, duration: 3 * 3600)
        case .tonight:
            // Until 04:00: today's if it is still ahead (after midnight),
            // otherwise tomorrow's.
            guard let todayFour = calendar.date(bySettingHour: 4, minute: 0, second: 0, of: now) else { return nil }
            if todayFour > now { return DateInterval(start: now, end: todayFour) }
            guard let tomorrow = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now)),
                  let end = calendar.date(bySettingHour: 4, minute: 0, second: 0, of: tomorrow) else { return nil }
            return DateInterval(start: now, end: end)
        case .at6pm, .at8pm, .at10pm:
            guard let hour, let at = calendar.date(bySettingHour: hour, minute: 0, second: 0, of: now) else { return nil }
            return DateInterval(start: at.addingTimeInterval(-3600), end: at.addingTimeInterval(2 * 3600))
        case .saturday:
            let saturday = Self.targetSaturday(now: now, calendar: calendar)
            guard let start = calendar.date(bySettingHour: 18, minute: 0, second: 0, of: saturday),
                  let sunday = calendar.date(byAdding: .day, value: 1, to: saturday),
                  let end = calendar.date(bySettingHour: 2, minute: 0, second: 0, of: sunday) else { return nil }
            return DateInterval(start: start, end: end)
        }
    }

    /// The instant a restaurant has to be open at: the chip's hour, 7 PM for
    /// an evening that has not started yet, else now.
    func probeTime(now: Date, calendar: Calendar = DesMoinesTime.calendar) -> Date? {
        switch self {
        case .anytime:
            return nil
        case .now:
            return now
        case .tonight:
            guard let seven = calendar.date(bySettingHour: 19, minute: 0, second: 0, of: now) else { return now }
            return max(now, seven)
        case .at6pm, .at8pm, .at10pm:
            guard let hour else { return nil }
            return calendar.date(bySettingHour: hour, minute: 0, second: 0, of: now)
        case .saturday:
            let saturday = Self.targetSaturday(now: now, calendar: calendar)
            let seven = calendar.date(bySettingHour: 19, minute: 0, second: 0, of: saturday) ?? saturday
            return max(now, seven)
        }
    }

    /// Whether an event is on during `window`.
    ///
    /// Timed: its run (end_date, else three hours, the web's default)
    /// overlaps the window. Untimed (time TBA, the 19:31:58 marker, SeatGeek's
    /// 03:30): one of its Central days is one of the window's Central days,
    /// because the stored time is a placeholder and cannot be compared.
    static func eventMatches(_ event: Event, window: DateInterval, calendar: Calendar = DesMoinesTime.calendar) -> Bool {
        guard let start = event.parsedDate else { return false }
        if event.hasSpecificTime {
            var end = event.parsedEndDate ?? start.addingTimeInterval(3 * 3600)
            if end <= start { end = start.addingTimeInterval(3 * 3600) }
            return start < window.end && end > window.start
        }
        let firstDay = calendar.startOfDay(for: start)
        let lastDay = max(firstDay, calendar.startOfDay(for: event.parsedEndDate ?? start))
        let windowFirstDay = calendar.startOfDay(for: window.start)
        let windowLastDay = calendar.startOfDay(for: max(window.start, window.end.addingTimeInterval(-1)))
        return firstDay <= windowLastDay && lastDay >= windowFirstDay
    }
}
