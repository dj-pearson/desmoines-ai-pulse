import Foundation

/// The Fri–Sun window for the "This Weekend" guide (IOS-PARITY-004). Mirrors the
/// web `/weekend` curation (EventsThisWeekend.tsx): the weekend is anchored to
/// Friday 00:00 Central and runs through Sunday end-of-day Central. On Sat/Sun
/// it refers to the CURRENT weekend (Friday is in the recent past); mid-week
/// it's the upcoming weekend. Pure value type so the date math is unit-testable.
///
/// Every default calendar is `DesMoinesTime.calendar` (IOS-DD-BROWSE-01). The
/// device calendar put a phone in London on Saturday while Des Moines was
/// still on Friday evening, and bucketed a Friday 7:31 PM show into Saturday.
struct WeekendWindow: Equatable {
    /// Friday 00:00 Central.
    let fridayStart: Date
    /// Saturday 00:00.
    let saturdayStart: Date
    /// Sunday 00:00.
    let sundayStart: Date
    /// Monday 00:00 — exclusive end of the window.
    let mondayStart: Date

    /// The three weekend days, in order.
    enum Day: String, CaseIterable, Identifiable {
        case friday, saturday, sunday
        var id: String { rawValue }
        var title: String {
            switch self {
            case .friday: return "Friday"
            case .saturday: return "Saturday"
            case .sunday: return "Sunday"
            }
        }
        var systemImage: String { "calendar" }
    }

    /// Builds the window for `now` (defaults to the current date).
    static func current(now: Date = Date(), calendar: Calendar = DesMoinesTime.calendar) -> WeekendWindow {
        let startOfToday = calendar.startOfDay(for: now)
        // weekday: 1 = Sunday … 7 = Saturday. Convert to 0=Sun … 6=Sat.
        let day = calendar.component(.weekday, from: now) - 1
        // Offset to this weekend's Friday (matches the web offsetToFriday).
        let offsetToFriday = (day == 0) ? -2 : (5 - day)
        let friday = calendar.date(byAdding: .day, value: offsetToFriday, to: startOfToday) ?? startOfToday
        let saturday = calendar.date(byAdding: .day, value: 1, to: friday) ?? friday
        let sunday = calendar.date(byAdding: .day, value: 2, to: friday) ?? friday
        let monday = calendar.date(byAdding: .day, value: 3, to: friday) ?? friday
        return WeekendWindow(fridayStart: friday, saturdayStart: saturday, sundayStart: sunday, mondayStart: monday)
    }

    /// Which weekend day a given event date falls on (nil if outside the window).
    func day(for date: Date, calendar: Calendar = DesMoinesTime.calendar) -> Day? {
        if calendar.isDate(date, inSameDayAs: fridayStart) { return .friday }
        if calendar.isDate(date, inSameDayAs: saturdayStart) { return .saturday }
        if calendar.isDate(date, inSameDayAs: sundayStart) { return .sunday }
        return nil
    }

    /// Friendly range label, e.g. "June 6 - 8", in Central time. A distinct
    /// base name from `rangeLabel`, so `window.rangeLabel` can never resolve
    /// to an unapplied method reference.
    func rangeText(calendar: Calendar = DesMoinesTime.calendar) -> String {
        let monthDay = DesMoinesTime.style(.dateTime.month(.wide).day())
        let dayOnly = DesMoinesTime.style(.dateTime.day())
        let startStr = fridayStart.formatted(monthDay)
        // If Friday and Sunday share a month, show "June 6 - 8"; else full both.
        if calendar.component(.month, from: fridayStart) == calendar.component(.month, from: sundayStart) {
            return "\(startStr) - \(sundayStart.formatted(dayOnly))"
        }
        return "\(startStr) - \(sundayStart.formatted(monthDay))"
    }

    var rangeLabel: String { rangeText(calendar: DesMoinesTime.calendar) }
}
