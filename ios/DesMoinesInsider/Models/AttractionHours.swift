import Foundation

/// Open status and a weekly table from `attractions.hours` (IOS-DD-BROWSE-10),
/// ported from src/lib/attractionHours.ts on top of `RestaurantHours`, so the
/// clock is Central and the open/closing-soon/next-opening rules are the
/// restaurant ones.
///
/// attractions.hours is jsonb shaped `{ mon: { open, close }, tue: ..., ... }`
/// (20260520000004). A MISSING DAY IS NOT A CLOSED DAY: a day is closed only
/// when it says so (`null`, `false`, `"closed"` or `{ closed: true }`). So
/// when today is missing the status is unknown, and when some other day is
/// missing a "Closed, opens Thu 9 AM" is cut back to "Closed", because the
/// next opening could fall on the day nobody entered.
enum AttractionHours {

    /// The three-letter keys, Monday first, with their Sunday-0 weekday.
    static let week: [(key: String, label: String, day: Int)] = [
        ("mon", "Monday", 1), ("tue", "Tuesday", 2), ("wed", "Wednesday", 3),
        ("thu", "Thursday", 4), ("fri", "Friday", 5), ("sat", "Saturday", 6),
        ("sun", "Sunday", 0),
    ]

    /// One day as stored.
    enum DayValue: Codable, Hashable {
        case open(open: String, close: String)
        case closed
        case missing

        private enum Keys: String, CodingKey { case open, close, closed }

        /// Never throws: anything unreadable is `.missing`, so one bad day
        /// cannot fail the week (or the attraction row).
        init(from decoder: Decoder) throws {
            guard let single = try? decoder.singleValueContainer() else { self = .missing; return }
            if single.decodeNil() { self = .closed; return }
            if let flag = try? single.decode(Bool.self) {
                self = flag ? .missing : .closed
                return
            }
            if let text = try? single.decode(String.self) {
                self = text.trimmingCharacters(in: .whitespaces).lowercased() == "closed" ? .closed : .missing
                return
            }
            guard let c = try? decoder.container(keyedBy: Keys.self) else { self = .missing; return }
            if (try? c.decodeIfPresent(Bool.self, forKey: .closed)) == true { self = .closed; return }
            guard let open = (try? c.decodeIfPresent(String.self, forKey: .open)) ?? nil,
                  let close = (try? c.decodeIfPresent(String.self, forKey: .close)) ?? nil,
                  let openMinute = AttractionHours.parseClock(open),
                  AttractionHours.parseClock(close) != nil,
                  openMinute < RestaurantHours.minutesPerDay else {
                self = .missing
                return
            }
            self = .open(open: open, close: close)
        }

        func encode(to encoder: Encoder) throws {
            switch self {
            case .open(let open, let close):
                var c = encoder.container(keyedBy: Keys.self)
                try c.encode(open, forKey: .open)
                try c.encode(close, forKey: .close)
            case .closed:
                var c = encoder.singleValueContainer()
                try c.encode("closed")
            case .missing:
                var c = encoder.singleValueContainer()
                try c.encodeNil()
            }
        }

        /// Minutes after midnight, when open.
        var minutes: (open: Int, close: Int)? {
            guard case .open(let o, let c) = self,
                  let open = AttractionHours.parseClock(o),
                  let close = AttractionHours.parseClock(c) else { return nil }
            return (open, close)
        }
    }

    /// The stored week, keyed by three-letter day ("mon"..."sun").
    struct Week: Codable, Hashable {
        var days: [String: DayValue]

        init(days: [String: DayValue]) {
            self.days = days
        }

        private struct DynamicKey: CodingKey {
            var stringValue: String
            var intValue: Int? { nil }
            init?(stringValue: String) { self.stringValue = stringValue }
            init?(intValue: Int) { return nil }
        }

        /// Throws only when the value is not an object (a string such as
        /// "9-5"), which the Attraction decoder turns into nil. Keys are
        /// normalised as the web does: trimmed, lowercased, first three
        /// letters, so "Monday" and "MON" both land on "mon".
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: DynamicKey.self)
            var days: [String: DayValue] = [:]
            for key in c.allKeys {
                let day = String(key.stringValue.trimmingCharacters(in: .whitespaces).lowercased().prefix(3))
                if (try? c.decodeNil(forKey: key)) == true {
                    days[day] = .closed
                } else {
                    days[day] = (try? c.decode(DayValue.self, forKey: key)) ?? .missing
                }
            }
            self.days = days
        }

        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: DynamicKey.self)
            for (day, value) in days where value != .missing {
                guard let key = DynamicKey(stringValue: day) else { continue }
                try c.encode(value, forKey: key)
            }
        }

        func value(for key: String) -> DayValue {
            days[key] ?? .missing
        }

        /// Every day of the week is entered, open or closed.
        var isComplete: Bool {
            AttractionHours.week.allSatisfy { value(for: $0.key) != .missing }
        }
    }

    // MARK: - Clock

    /// Minutes after midnight for "09:00", "9:00", "17:30", "24:00", "9am",
    /// "9:30 PM". Nil for anything else, including a bare "9" (two readings)
    /// and words such as "noon". Port of parseClock in attractionHours.ts.
    static func parseClock(_ value: String) -> Int? {
        let s = value.trimmingCharacters(in: .whitespaces).lowercased().replacingOccurrences(of: ".", with: "")
        let pattern = #"^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?$"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) else { return nil }
        func group(_ i: Int) -> String? {
            guard let r = Range(match.range(at: i), in: s) else { return nil }
            return String(s[r])
        }
        guard let hourText = group(1), var hour = Int(hourText) else { return nil }
        let minuteText = group(2)
        let minute = minuteText.flatMap(Int.init) ?? 0
        guard minute <= 59 else { return nil }
        if let meridiem = group(3) {
            guard (1...12).contains(hour) else { return nil }
            if hour == 12 { hour = 0 }
            if meridiem == "pm" { hour += 12 }
        } else if minuteText == nil {
            return nil
        }
        if hour > 24 || (hour == 24 && minute != 0) { return nil }
        return hour * 60 + minute
    }

    // MARK: - Status

    /// Weekly intervals in Central week minutes (Sunday 00:00 = 0). A close at
    /// or before the open runs into the next morning.
    static func intervals(_ w: Week) -> [RestaurantHours.Interval] {
        var out: [RestaurantHours.Interval] = []
        for entry in week {
            guard let m = w.value(for: entry.key).minutes else { continue }
            let start = entry.day * RestaurantHours.minutesPerDay + m.open
            var end = entry.day * RestaurantHours.minutesPerDay + m.close
            if m.close <= m.open { end += RestaurantHours.minutesPerDay }
            out.append(RestaurantHours.Interval(start: start, end: end))
        }
        return out
    }

    /// The three-letter key of `date`'s Central weekday.
    static func dayKey(at date: Date) -> String {
        let weekday = RestaurantHours.weekMinute(date) / RestaurantHours.minutesPerDay
        return week.first { $0.day == weekday }?.key ?? "mon"
    }

    /// Today's status. Unknown with no hours or when today was never
    /// entered, unless last night's hours run past midnight into now; see the
    /// type comment for the missing-day rules.
    static func status(week: Week?, at date: Date) -> OpenStatus {
        guard let week else { return .unknown }
        let spans = Self.intervals(week)
        // Today entered as closed and no day has hours: still a real answer.
        let result: OpenStatus = spans.isEmpty
            ? .closed(nextOpensAt: nil)
            : RestaurantHours.evaluateIntervals(spans, at: RestaurantHours.weekMinute(date))
        if result.isOpen { return result }
        if week.value(for: dayKey(at: date)) == .missing { return .unknown }
        if !week.isComplete, case .closed(let next) = result, next != nil {
            return .closed(nextOpensAt: nil)
        }
        return result
    }

    /// One row of the weekly table.
    struct Row: Equatable {
        let label: String
        /// "9 AM - 5 PM", "Closed", or nil when the day was never entered.
        let text: String?
        let isToday: Bool
    }

    /// Seven rows, Monday first. Empty when no day is readable, so the
    /// caller shows no table rather than seven blanks.
    static func weeklyRows(_ w: Week, now: Date) -> [Row] {
        let today = dayKey(at: now)
        let rows = week.map { entry -> Row in
            let value = w.value(for: entry.key)
            let text: String?
            if let m = value.minutes {
                text = formatRange(open: m.open, close: m.close)
            } else if value == .closed {
                text = "Closed"
            } else {
                text = nil
            }
            return Row(label: entry.label, text: text, isToday: entry.key == today)
        }
        return rows.contains { $0.text != nil } ? rows : []
    }

    private static func formatRange(open: Int, close: Int) -> String {
        if open == 0 && (close == RestaurantHours.minutesPerDay || close == 0) { return "Open 24 hours" }
        return "\(RestaurantHours.formatClockLabel(open)) - \(RestaurantHours.formatClockLabel(close % RestaurantHours.minutesPerDay))"
    }
}
