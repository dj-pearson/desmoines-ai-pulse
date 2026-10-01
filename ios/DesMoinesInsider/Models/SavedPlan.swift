import Foundation

// MARK: - Saved tab as a plan for the week (IOS-DD-SAVED-18)
//
// Saved events used to be two flat lists, upcoming and past, split on
// `start < now`. They are now grouped the way people plan: what is on now,
// today, this weekend, the next seven days, later, and a collapsed past group.
// Pure functions of (events, now, calendar) so the grouping is tested without
// a view.

enum SavedEventBucket: Int, CaseIterable, Identifiable {
    case happeningNow, today, thisWeekend, nextSevenDays, later, past

    var id: Int { rawValue }

    var title: String {
        switch self {
        case .happeningNow: return "Happening now"
        case .today: return "Today"
        case .thisWeekend: return "This weekend"
        case .nextSevenDays: return "Next 7 days"
        case .later: return "Later"
        case .past: return "Past events"
        }
    }

    var icon: String {
        switch self {
        case .happeningNow: return "dot.radiowaves.left.and.right"
        case .today: return "sun.max.fill"
        case .thisWeekend: return "calendar.badge.clock"
        case .nextSevenDays: return "calendar"
        case .later: return "calendar.badge.plus"
        case .past: return "clock.arrow.circlepath"
        }
    }
}

/// One non-empty bucket and its events, in display order.
struct SavedEventGroup: Identifiable {
    let bucket: SavedEventBucket
    let events: [Event]

    var id: Int { bucket.rawValue }
}

enum SavedPlan {

    /// Which bucket `event` belongs in at `now`. Day boundaries are Des Moines
    /// days, and the weekend is `WeekendWindow` built on the same calendar.
    static func bucket(
        for event: Event,
        now: Date,
        calendar: Calendar = DesMoinesTime.calendar,
        weekend: WeekendWindow? = nil
    ) -> SavedEventBucket {
        if event.isOver(at: now, calendar: calendar) { return .past }
        guard let start = event.parsedDate else { return .later }
        if start <= now {
            return event.hasSpecificTime ? .happeningNow : .today
        }
        if calendar.isDate(start, inSameDayAs: now) { return .today }
        let window = weekend ?? WeekendWindow.current(now: now, calendar: calendar)
        if start >= window.fridayStart && start < window.mondayStart { return .thisWeekend }
        let horizon = calendar.date(byAdding: .day, value: 8, to: calendar.startOfDay(for: now)) ?? now
        if start < horizon { return .nextSevenDays }
        return .later
    }

    /// Groups and orders saved events, dropping empty buckets. Past runs
    /// newest first; every other bucket soonest first, ties broken on id.
    static func arrange(_ events: [Event], now: Date, calendar: Calendar = DesMoinesTime.calendar) -> [SavedEventGroup] {
        let weekend = WeekendWindow.current(now: now, calendar: calendar)
        var buckets: [SavedEventBucket: [Event]] = [:]
        for event in events {
            buckets[bucket(for: event, now: now, calendar: calendar, weekend: weekend), default: []].append(event)
        }
        return SavedEventBucket.allCases.compactMap { bucket in
            guard let rows = buckets[bucket], !rows.isEmpty else { return nil }
            let sorted = rows.sorted { a, b in
                let da = a.parsedDate ?? .distantFuture
                let db = b.parsedDate ?? .distantFuture
                if da != db { return bucket == .past ? da > db : da < db }
                return a.id < b.id
            }
            return SavedEventGroup(bucket: bucket, events: sorted)
        }
    }

    /// "This weekend: 3 plans, 2 free", or nil when nothing is saved for it.
    static func weekendHeadline(_ groups: [SavedEventGroup]) -> String? {
        guard let weekend = groups.first(where: { $0.bucket == .thisWeekend }) else { return nil }
        let count = weekend.events.count
        var text = "This weekend: \(count) plan\(count == 1 ? "" : "s")"
        let free = weekend.events.filter(\.isFree).count
        if free > 0 { text += ", \(free) free" }
        return text
    }

    // MARK: - Share text (IOS-DD-SAVED-25)

    /// Plain text with links, for the share sheet. Past events are left out.
    /// Attractions carry no link: the web resolves /attractions/ by slug only
    /// and the app's Attraction has no slug.
    static func shareText(
        groups: [SavedEventGroup],
        restaurants: [Restaurant],
        attractions: [Attraction],
        title: String,
        siteURL: URL = Config.siteURL
    ) -> String {
        let site = siteURL.absoluteString.hasSuffix("/")
            ? String(siteURL.absoluteString.dropLast())
            : siteURL.absoluteString
        var lines: [String] = [title]

        for group in groups where group.bucket != .past && !group.events.isEmpty {
            lines.append("")
            lines.append(group.bucket.title)
            for event in group.events {
                var line = "- \(event.title)"
                if let date = event.parsedDate {
                    line += ", \(event.cardDateText(date))"
                }
                line += " \(site)/events/\(event.id)"
                lines.append(line)
            }
        }

        if !restaurants.isEmpty {
            lines.append("")
            lines.append("Places to eat")
            for restaurant in restaurants {
                let key = (restaurant.slug?.isEmpty == false ? restaurant.slug : nil) ?? restaurant.id
                lines.append("- \(restaurant.name) \(site)/restaurants/\(key)")
            }
        }

        if !attractions.isEmpty {
            lines.append("")
            lines.append("Places to go")
            for attraction in attractions {
                lines.append("- \(attraction.name)")
            }
        }

        return lines
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .joined(separator: "\n")
    }

    // MARK: - Reconcile (IOS-DD-SAVED-13)

    /// What to drop from the loaded rows and what to fetch, given the ids on
    /// screen and the ids the service now holds.
    static func diff(loaded: Set<String>, current: Set<String>) -> (toRemove: Set<String>, toFetch: Set<String>) {
        (loaded.subtracting(current), current.subtracting(loaded))
    }
}
