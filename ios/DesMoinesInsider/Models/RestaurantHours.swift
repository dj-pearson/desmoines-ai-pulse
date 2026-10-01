import Foundation

// MARK: - Stored hours (restaurants.hours_json)

/// The stored shape of `restaurants.hours_json` (WEB-BE-045), written by
/// supabase/functions/_shared/placeHours.ts from Google Places.
///
/// Decoded leniently, and never throws (IOS-DD-RESTAURANTS-01): a bad value in
/// one row must not fail the Restaurant decode and with it the whole page.
/// Anything unreadable becomes "no periods", which evaluates to unknown.
struct StoredHours: Codable, Hashable {
    var version: Int?
    var timeZone: String?
    var periods: [Period]
    var weekdayDescriptions: [String]

    struct Period: Codable, Hashable {
        var open: Point?
        var close: Point?

        init(open: Point?, close: Point?) {
            self.open = open
            self.close = close
        }

        init(from decoder: Decoder) throws {
            guard let c = try? decoder.container(keyedBy: CodingKeys.self) else {
                open = nil
                close = nil
                return
            }
            open = try? c.decodeIfPresent(Point.self, forKey: .open)
            close = try? c.decodeIfPresent(Point.self, forKey: .close)
        }
    }

    struct Point: Codable, Hashable {
        var day: Int?
        var hour: Int?
        var minute: Int?

        init(day: Int?, hour: Int?, minute: Int? = nil) {
            self.day = day
            self.hour = hour
            self.minute = minute
        }

        init(from decoder: Decoder) throws {
            guard let c = try? decoder.container(keyedBy: CodingKeys.self) else {
                day = nil
                hour = nil
                minute = nil
                return
            }
            day = try? c.decodeIfPresent(Int.self, forKey: .day)
            hour = try? c.decodeIfPresent(Int.self, forKey: .hour)
            minute = try? c.decodeIfPresent(Int.self, forKey: .minute)
        }
    }

    init(version: Int? = nil, timeZone: String? = nil, periods: [Period] = [], weekdayDescriptions: [String] = []) {
        self.version = version
        self.timeZone = timeZone
        self.periods = periods
        self.weekdayDescriptions = weekdayDescriptions
    }

    init(from decoder: Decoder) throws {
        guard let c = try? decoder.container(keyedBy: CodingKeys.self) else {
            version = nil
            timeZone = nil
            periods = []
            weekdayDescriptions = []
            return
        }
        version = try? c.decodeIfPresent(Int.self, forKey: .version)
        timeZone = try? c.decodeIfPresent(String.self, forKey: .timeZone)
        periods = (try? c.decodeIfPresent([Period].self, forKey: .periods)) ?? []
        weekdayDescriptions = (try? c.decodeIfPresent([String].self, forKey: .weekdayDescriptions)) ?? []
    }
}

// MARK: - Open status

/// Whether a restaurant is open, in Des Moines time. Mirrors
/// RestaurantOpenResult in src/lib/restaurantHours.ts.
enum OpenStatus: Equatable {
    case open(closesAt: String?)
    case closingSoon(closesAt: String?)
    case closed(nextOpensAt: String?)
    case unknown

    var isOpen: Bool {
        switch self {
        case .open, .closingSoon: return true
        case .closed, .unknown: return false
        }
    }

    /// The Central closing time when open, else nil.
    var closesAt: String? {
        switch self {
        case .open(let c), .closingSoon(let c): return c
        case .closed, .unknown: return nil
        }
    }

    /// One short line for a card or detail row, or nil when there is nothing
    /// honest to say. formatOpenStatusLine on the web.
    var line: String? {
        switch self {
        case .open(let closesAt):
            return closesAt.map { "Open until \($0)" } ?? "Open 24 hours"
        case .closingSoon(let closesAt):
            return closesAt.map { "Closes at \($0)" } ?? "Closing soon"
        case .closed(let next):
            return next.map { "Closed, opens \($0)" } ?? "Closed"
        case .unknown:
            return nil
        }
    }
}

// MARK: - Evaluator

/// Port of the structured-hours half of src/lib/restaurantHours.ts
/// (IOS-DD-RESTAURANTS-01). The clock is Central whatever zone the phone is
/// in, and it fails closed: no usable periods is `.unknown`, which renders as
/// no badge. The free-text `opening` parser is deliberately not ported; a row
/// with only text stays unknown.
enum RestaurantHours {
    static let minutesPerDay = 24 * 60
    static let minutesPerWeek = 7 * minutesPerDay
    static let closingSoonMinutes = 60

    /// An open interval in minutes since Sunday 00:00, end exclusive,
    /// possibly past the week end.
    struct Interval: Equatable {
        var start: Int
        var end: Int
    }

    private static let dayShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

    /// lifecycle `status` values that mean you cannot eat there today
    /// (isVisitableStatus on the web).
    static let notVisitableStatuses: Set<String> = [
        "closed", "opening_soon", "announced", "permanently_closed",
        "temporarily_closed", "closed_permanently", "closed_temporarily", "coming_soon",
    ]

    static func isVisitableStatus(_ status: String?) -> Bool {
        guard let status else { return true }
        return !notVisitableStatuses.contains(status.trimmingCharacters(in: .whitespaces).lowercased())
    }

    /// Cached: DesMoinesTime.calendar builds a new Calendar per access, and
    /// the Open Now filter evaluates every loaded row.
    private static let calendar = DesMoinesTime.calendar

    /// The Central week minute (0 = Sunday 00:00) of `date`.
    static func weekMinute(_ date: Date) -> Int {
        let parts = calendar.dateComponents([.weekday, .hour, .minute], from: date)
        let weekday = parts.weekday ?? 1
        return (weekday - 1) * minutesPerDay + (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
    }

    /// The open status for a row.
    static func status(hours: StoredHours?, businessStatus: String?, lifecycle: String?, at date: Date) -> OpenStatus {
        let business = businessStatus?.uppercased() ?? ""
        if business == "CLOSED_PERMANENTLY" || business == "CLOSED_TEMPORARILY" {
            return .closed(nextOpensAt: nil)
        }
        if !isVisitableStatus(lifecycle) { return .closed(nextOpensAt: nil) }
        let intervals = intervalsFromJson(hours)
        guard !intervals.isEmpty else { return .unknown }
        return evaluateIntervals(intervals, at: weekMinute(date))
    }

    /// Weekly intervals from hours_json periods, or [] when none is usable.
    /// A period with no close is dropped, not read as open around the clock.
    static func intervalsFromJson(_ hours: StoredHours?) -> [Interval] {
        guard let periods = hours?.periods else { return [] }
        var out: [Interval] = []
        for period in periods {
            guard let open = period.open, let close = period.close,
                  let openDay = open.day, (0...6).contains(openDay),
                  let openHour = open.hour, (0...23).contains(openHour),
                  let closeHour = close.hour, (0...24).contains(closeHour) else { continue }
            let openMinute = open.minute ?? 0
            let closeMinute = close.minute ?? 0
            guard (0...59).contains(openMinute), (0...59).contains(closeMinute) else { continue }
            let closeDay = close.day ?? openDay
            guard (0...6).contains(closeDay) else { continue }
            let start = openDay * minutesPerDay + openHour * 60 + openMinute
            var end = closeDay * minutesPerDay + closeHour * 60 + closeMinute
            if end <= start { end += minutesPerWeek }
            out.append(Interval(start: start, end: end))
        }
        return out
    }

    /// Sort and merge touching or overlapping intervals, wrapping Saturday
    /// night into Sunday.
    static func mergeIntervals(_ intervals: [Interval]) -> [Interval] {
        guard !intervals.isEmpty else { return [] }
        let sorted = intervals
            .map { Interval(start: $0.start, end: min($0.end, $0.start + minutesPerWeek)) }
            .sorted { $0.start < $1.start }
        var merged: [Interval] = []
        for i in sorted {
            if let last = merged.last, i.start <= last.end {
                merged[merged.count - 1].end = max(last.end, i.end)
            } else {
                merged.append(i)
            }
        }
        // An interval running past the week end may reach the first one.
        if merged.count > 1, let first = merged.first, let last = merged.last,
           last.end >= first.start + minutesPerWeek {
            merged[merged.count - 1].end = max(last.end, first.end + minutesPerWeek)
            merged.removeFirst()
        }
        return merged
    }

    /// Evaluate weekly intervals at week minute `t`.
    static func evaluateIntervals(_ intervals: [Interval], at t: Int) -> OpenStatus {
        let merged = mergeIntervals(intervals)
        guard !merged.isEmpty else { return .unknown }

        for i in merged {
            for shift in [0, minutesPerWeek] {
                let at = t + shift
                guard at >= i.start && at < i.end else { continue }
                if i.end - i.start >= minutesPerWeek { return .open(closesAt: nil) }
                let left = i.end - at
                let label = formatClockLabel(i.end)
                return left <= closingSoonMinutes ? .closingSoon(closesAt: label) : .open(closesAt: label)
            }
        }

        var wait = Int.max
        var opensAt = 0
        for i in merged {
            let start = i.start % minutesPerWeek
            let delta = (start - t + minutesPerWeek) % minutesPerWeek
            if delta > 0 && delta < wait {
                wait = delta
                opensAt = start
            }
        }
        guard wait != Int.max else { return .closed(nextOpensAt: nil) }

        let dayDelta = (t + wait) / minutesPerDay - t / minutesPerDay
        let clock = formatClockLabel(opensAt)
        let label: String
        switch dayDelta {
        case 0: label = clock
        case 1: label = "tomorrow \(clock)"
        default: label = "\(dayShort[opensAt / minutesPerDay]) \(clock)"
        }
        return .closed(nextOpensAt: label)
    }

    /// "10 PM", "10:30 PM", "midnight", "noon".
    static func formatClockLabel(_ minutesOfDay: Int) -> String {
        let m = ((minutesOfDay % minutesPerDay) + minutesPerDay) % minutesPerDay
        if m == 0 { return "midnight" }
        if m == 12 * 60 { return "noon" }
        let h24 = m / 60
        let mm = m % 60
        let suffix = h24 < 12 ? "AM" : "PM"
        let h12 = h24 % 12 == 0 ? 12 : h24 % 12
        return mm == 0 ? "\(h12) \(suffix)" : "\(h12):\(String(format: "%02d", mm)) \(suffix)"
    }
}
