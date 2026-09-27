import Foundation

/// One-tap date ranges for the Trip Planner (IOS-DD-TRIP-PLANNER-14).
///
/// Most plans are for a Des Moines weekend, and the form used to open on
/// "today to tomorrow" with two pickers to fix. Computed in Central time with
/// WeekendWindow, the same Fri-Sun window the This Weekend rail uses.
enum TripDatePreset: CaseIterable, Identifiable {
    case thisWeekend
    case tomorrow
    case nextWeekend

    var id: Self { self }

    var title: String {
        switch self {
        case .thisWeekend: return "This weekend"
        case .tomorrow: return "Tomorrow"
        case .nextWeekend: return "Next weekend"
        }
    }

    /// Start and end days (Central midnights, end inclusive). On a Saturday
    /// "this weekend" starts today, not on the Friday that has passed.
    func range(now: Date) -> (start: Date, end: Date) {
        let cal = DesMoinesTime.calendar
        let today = cal.startOfDay(for: now)
        switch self {
        case .tomorrow:
            let tomorrow = cal.date(byAdding: .day, value: 1, to: today) ?? today
            return (tomorrow, tomorrow)
        case .thisWeekend:
            let window = WeekendWindow.current(now: now, calendar: cal)
            return (max(window.fridayStart, today), window.sundayStart)
        case .nextWeekend:
            let window = WeekendWindow.current(now: now, calendar: cal)
            let friday = cal.date(byAdding: .day, value: 7, to: window.fridayStart) ?? window.fridayStart
            let sunday = cal.date(byAdding: .day, value: 7, to: window.sundayStart) ?? window.sundayStart
            return (friday, sunday)
        }
    }

    /// The preset whose days match the picked range, for the selected state.
    static func matching(start: Date, end: Date, now: Date) -> TripDatePreset? {
        let cal = DesMoinesTime.calendar
        let s = cal.startOfDay(for: start)
        let e = cal.startOfDay(for: end)
        return allCases.first { preset in
            let r = preset.range(now: now)
            return r.start == s && r.end == e
        }
    }
}
