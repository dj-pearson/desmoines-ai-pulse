import Foundation

/// A run of whole Des Moines calendar days that Search limits events to
/// (IOS-AUDIT-003): the web hub's `?from=&to=` and the monthly archive
/// (`/events/june-2026`). SearchFilters had date presets only, so both used
/// to lose their dates on iOS.
///
/// Days are kept as `yyyy-MM-dd` strings, the shape the web writes, and only
/// turned into instants by `window(calendar:)`, so a phone in another time
/// zone cannot shift a boundary (the same rule as IOS-DD-EVENTS-05).
struct EventDayRange: Hashable {
    /// First day, inclusive.
    let first: String
    /// Last day, inclusive. Equal to `first` for a single day.
    let last: String
    /// "June 2026" for a month page; nil for a `from`/`to` range.
    let monthTitle: String?

    /// The web's `resolveHubDate` rules for `?from=&to=`
    /// (src/components/events/eventsHubQuery.ts): no valid `from` is no
    /// range; a missing or invalid `to` is the single day `from`; an inverted
    /// pair is read the right way round.
    init?(from: String?, to: String?) {
        guard let start = Self.validDay(from) else { return nil }
        let end = Self.validDay(to) ?? start
        // yyyy-MM-dd strings sort the same way as the dates they name.
        first = min(start, end)
        last = max(start, end)
        monthTitle = nil
    }

    /// `/events/<month>-<yyyy>`, the shape `EventSlug.isMonthPage` accepts.
    /// Nil for anything else.
    init?(monthSlug: String) {
        let parts = monthSlug.split(separator: "-")
        guard parts.count == 2, parts[1].count == 4,
              let year = Int(parts[1]),
              let index = Self.monthSlugs.firstIndex(of: String(parts[0])) else { return nil }
        let month = index + 1
        guard let days = Self.daysInMonth(year: year, month: month) else { return nil }
        first = String(format: "%04d-%02d-01", year, month)
        last = String(format: "%04d-%02d-%02d", year, month, days)
        let name = Self.monthSlugs[index]
        monthTitle = String(name.prefix(1)).uppercased() + String(name.dropFirst()) + " \(year)"
    }

    /// Midnight Central on `first` to midnight Central after `last`; the end
    /// is exclusive, which is how EventsService applies `dateEnd`.
    func window(calendar: Calendar = DesMoinesTime.calendar) -> (start: Date, end: Date)? {
        guard let start = Self.midnight(first, calendar: calendar),
              let lastMidnight = Self.midnight(last, calendar: calendar),
              let end = calendar.date(byAdding: .day, value: 1, to: lastMidnight) else { return nil }
        return (start, end)
    }

    /// True once the last day is over in Des Moines.
    func hasEnded(now: Date, calendar: Calendar = DesMoinesTime.calendar) -> Bool {
        guard let end = window(calendar: calendar)?.end else { return true }
        return now >= end
    }

    /// The chip label: "June 2026", "Jun 5", or "Jun 5 - Jun 9", the web's
    /// dayLabel format.
    var label: String {
        if let monthTitle { return monthTitle }
        let a = Self.dayLabel(first)
        return first == last ? a : "\(a) - \(Self.dayLabel(last))"
    }

    // MARK: - Helpers

    static let monthSlugs = [
        "january", "february", "march", "april", "may", "june",
        "july", "august", "september", "october", "november", "december",
    ]

    /// `yyyy-MM-dd` naming a real date, else nil. Stricter than the web's
    /// check, which lets JavaScript roll 2026-02-30 over to March 2; here it
    /// is no date at all.
    static func validDay(_ raw: String?) -> String? {
        guard let raw, raw.range(of: "^\\d{4}-\\d{2}-\\d{2}$", options: .regularExpression) != nil else { return nil }
        let parts = raw.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, (1...12).contains(parts[1]),
              let days = daysInMonth(year: parts[0], month: parts[1]),
              (1...days).contains(parts[2]) else { return nil }
        return raw
    }

    private static func daysInMonth(year: Int, month: Int) -> Int? {
        let cal = DesMoinesTime.calendar
        guard let date = cal.date(from: DateComponents(year: year, month: month, day: 1)) else { return nil }
        return cal.range(of: .day, in: .month, for: date)?.count
    }

    private static func midnight(_ day: String, calendar: Calendar) -> Date? {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    private static func dayLabel(_ day: String) -> String {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, (1...12).contains(parts[1]) else { return day }
        return "\(String(monthSlugs[parts[1] - 1].prefix(3)).capitalized) \(parts[2])"
    }
}
