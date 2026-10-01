import Foundation

/// The pure half of the This Weekend guide (IOS-DD-BROWSE-04 / 06): how the
/// weekend's rows split into days, what leads the screen, and which days are
/// already behind us. No I/O, so every rule here is unit-tested.
enum WeekendGuide {

    // MARK: - Bucketing (IOS-DD-BROWSE-04)

    /// Splits the weekend's rows into Fri/Sat/Sun by their Central start day.
    ///
    /// A row that started before Friday is a run still going (a festival or
    /// an exhibit; the query only returns it because its end_date reaches the
    /// weekend), so it goes to `allWeekend` instead of being dropped, which is
    /// what bucketing by start date alone used to do. Rows starting outside
    /// the window, or with no date, are dropped. Server order (date, id) is
    /// kept within each bucket, and a repeated id is kept once.
    static func bucket(
        _ events: [Event],
        window: WeekendWindow,
        calendar: Calendar = DesMoinesTime.calendar
    ) -> (byDay: [WeekendWindow.Day: [Event]], allWeekend: [Event]) {
        var byDay: [WeekendWindow.Day: [Event]] = [:]
        var allWeekend: [Event] = []
        var seen = Set<String>()
        for event in events {
            guard let start = event.parsedDate, !seen.contains(event.id) else { continue }
            if start < window.fridayStart {
                // Only a run that actually reaches Friday counts.
                guard let end = event.parsedEndDate, end >= window.fridayStart else { continue }
                seen.insert(event.id)
                allWeekend.append(event)
            } else if start < window.mondayStart, let day = window.day(for: start, calendar: calendar) {
                seen.insert(event.id)
                byDay[day, default: []].append(event)
            }
        }
        return (byDay, allWeekend)
    }

    // MARK: - Sections (IOS-DD-BROWSE-06)

    /// "Our picks": featured rows first, then rows with an editorial write-up,
    /// then the rest, soonest first within each; nothing that is already
    /// over; each id once.
    static func picks(_ events: [Event], now: Date, max: Int = 6) -> [Event] {
        func rank(_ e: Event) -> Int {
            if e.isFeatured == true { return 0 }
            if let writeup = e.aiWriteup, !writeup.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return 1 }
            return 2
        }
        let live = unique(events).filter { !$0.isOver(at: now) }
        let ordered = live.enumerated().sorted { a, b in
            let ra = rank(a.element), rb = rank(b.element)
            if ra != rb { return ra < rb }
            let da = a.element.parsedDate ?? .distantFuture
            let db = b.element.parsedDate ?? .distantFuture
            if da != db { return da < db }
            return a.offset < b.offset
        }
        return Array(ordered.map(\.element).prefix(max))
    }

    /// Free by the web's definition (`Event.isFreePrice`): a price that is not
    /// listed is never free.
    static func free(_ events: [Event], now: Date) -> [Event] {
        unique(events).filter { Event.isFreePrice($0.price) == true && !$0.isOver(at: now) }
    }

    /// The canonical Family category, not over.
    static func family(_ events: [Event], now: Date) -> [Event] {
        unique(events).filter { $0.eventCategory == .family && !$0.isOver(at: now) }
    }

    /// Which day sections lead and which fold away. From Friday to Sunday
    /// (Central), today and later are upcoming and the days already gone are
    /// past, so Saturday morning opens on Saturday instead of on last night.
    /// Outside the weekend all three are upcoming.
    static func orderedDays(
        window: WeekendWindow,
        now: Date,
        calendar: Calendar = DesMoinesTime.calendar
    ) -> (upcoming: [WeekendWindow.Day], past: [WeekendWindow.Day]) {
        let all = WeekendWindow.Day.allCases
        guard now >= window.fridayStart, now < window.mondayStart,
              let today = window.day(for: now, calendar: calendar),
              let todayIndex = all.firstIndex(of: today) else {
            return (all, [])
        }
        return (Array(all[todayIndex...]), Array(all[..<todayIndex]))
    }

    /// Rows still to come first, finished ones last, order otherwise kept.
    static func sortForToday(_ events: [Event], now: Date) -> [Event] {
        let over = events.map { $0.isOver(at: now) }
        return zip(events, over).filter { !$0.1 }.map(\.0) + zip(events, over).filter { $0.1 }.map(\.0)
    }

    private static func unique(_ events: [Event]) -> [Event] {
        var seen = Set<String>()
        return events.filter { seen.insert($0.id).inserted }
    }
}
