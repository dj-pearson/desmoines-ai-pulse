import Foundation

/// An `events` row read for a series page: the row plus the three switches
/// every other list filters out in the query (IOS-AUDIT-FEAT-046).
///
/// A series page lists past editions, and a past edition is exactly a row the
/// stale sweep has hidden, so these rows are read with hidden and archived
/// ones included and `EventSeriesSchedule` decides per row.
struct SeriesEventRow: Decodable, Equatable {
    let event: Event
    var isHidden: Bool?
    var hiddenAt: String?
    var archivedAt: String?

    enum CodingKeys: String, CodingKey {
        case isHidden = "is_hidden"
        case hiddenAt = "hidden_at"
        case archivedAt = "archived_at"
    }

    init(event: Event, isHidden: Bool? = nil, hiddenAt: String? = nil, archivedAt: String? = nil) {
        self.event = event
        self.isHidden = isHidden
        self.hiddenAt = hiddenAt
        self.archivedAt = archivedAt
    }

    /// The Event's own keys and these three come from the same JSON object.
    init(from decoder: Decoder) throws {
        event = try Event(from: decoder)
        let c = try decoder.container(keyedBy: CodingKeys.self)
        isHidden = try c.decodeIfPresent(Bool.self, forKey: .isHidden)
        hiddenAt = try c.decodeIfPresent(String.self, forKey: .hiddenAt)
        archivedAt = try c.decodeIfPresent(String.self, forKey: .archivedAt)
    }

    static func == (lhs: SeriesEventRow, rhs: SeriesEventRow) -> Bool {
        lhs.event.id == rhs.event.id && lhs.isHidden == rhs.isHidden
            && lhs.hiddenAt == rhs.hiddenAt && lhs.archivedAt == rhs.archivedAt
    }

    var isLive: Bool { isHidden != true && archivedAt == nil }
}

/// Decodes a series read, dropping a row that does not decode instead of
/// failing the page (the same rule as `LossyEventArray`).
struct LossySeriesRows: Decodable {
    let rows: [SeriesEventRow]

    private struct Maybe: Decodable {
        let row: SeriesEventRow?
        init(from decoder: Decoder) throws { row = try? SeriesEventRow(from: decoder) }
    }

    init(from decoder: Decoder) throws {
        rows = try [Maybe](from: decoder).compactMap(\.row)
    }
}

/// One Central day of a series.
struct SeriesInstance: Equatable, Identifiable {
    let row: SeriesEventRow
    /// Central yyyy-MM-dd of the start.
    let day: String
    /// The event id to open, or nil when its page no longer resolves.
    let linkId: String?
    let isOver: Bool

    var id: String { row.event.id }
}

/// One year of a series.
struct SeriesEdition: Equatable, Identifiable {
    let year: Int
    /// One per Central day, soonest first.
    var instances: [SeriesInstance]
    /// Distinct venue names, in order of first appearance.
    var venues: [String]
    /// Central yyyy-MM-dd of the first instance.
    var firstDay: String
    /// Central yyyy-MM-dd the edition ends: the last instance, or a later end_date.
    var lastDay: String

    var id: Int { year }
}

/// What a series screen shows.
struct SeriesSchedule: Equatable {
    /// The edition with something still to come, or nil.
    let current: SeriesEdition?
    /// Every other edition, newest first.
    let past: [SeriesEdition]
    /// When nothing is current, the year whose date is not out yet: the year
    /// after the latest edition, or this year if that is later.
    let unannouncedYear: Int?
    /// The newest edition's first venue.
    let venue: String?
    let total: Int
}

/// A port of the web's src/lib/eventSeriesView.ts selection rules
/// (`isModeratorHidden`, `isLinkable`, `buildSeriesView`), so the native
/// series screen lists the same editions the web page does:
///
///     visible (not hidden, not archived)  listed and linked
///     archived_at set                     listed and linked (a past event)
///     hidden by the stale sweep           listed, not linked: its page is gone
///     hidden by a moderator               left out
///
/// The sweep and a moderator both set is_hidden. The sweep only hides a row
/// whose date has passed, so a row hidden on or before its own Central day
/// was taken down by a person.
enum EventSeriesSchedule {
    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = DesMoinesTime.calendar
        f.timeZone = DesMoinesTime.timeZone
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// Central yyyy-MM-dd of an instant.
    static func centralDay(_ date: Date) -> String {
        dayFormatter.string(from: date)
    }

    /// Central yyyy-MM-dd of a row's start, or nil without a parseable date.
    static func centralDay(of row: SeriesEventRow) -> String? {
        row.event.parsedDate.map(centralDay)
    }

    /// True when a person, not the stale sweep, hid this row.
    static func isModeratorHidden(_ row: SeriesEventRow) -> Bool {
        guard row.isHidden == true else { return false }
        guard let day = centralDay(of: row), let hidden = DateParser.parse(row.hiddenAt) else { return true }
        return centralDay(hidden) <= day
    }

    /// The event page still opens this row (live, or archived as a past event).
    static func isLinkable(_ row: SeriesEventRow) -> Bool {
        row.isHidden != true
    }

    /// The Central day a stated end_date puts the run's end on, or nil
    /// without one. Mirrors the web's runEndDay over eventEnd: an end_date
    /// before the start is ignored, and then a timed row ends three hours in.
    private static func runEndDay(_ row: SeriesEventRow) -> String? {
        guard let explicit = row.event.parsedEndDate, let start = row.event.parsedDate else { return nil }
        if explicit >= start { return centralDay(explicit) }
        return centralDay(row.event.hasSpecificTime ? start.addingTimeInterval(3 * 3600) : start)
    }

    /// Live rows win a day, then archived, then hidden; ties go to the
    /// shorter title ("Hinterland 2026 Music Festival" over a day-pass row).
    private static func preferred(_ a: SeriesEventRow, _ b: SeriesEventRow) -> SeriesEventRow {
        func rank(_ r: SeriesEventRow) -> Int { r.isLive ? 0 : (r.isHidden == true ? 2 : 1) }
        if rank(a) != rank(b) { return rank(a) < rank(b) ? a : b }
        return a.event.title.count <= b.event.title.count ? a : b
    }

    /// Group a series' rows into editions by Central year and pick the
    /// current one. `def` filters again, since the query is a loose ilike:
    /// "Backyard BBQ Contest at Beaverdale Fall Festival" is not an edition.
    static func build(_ def: EventSeriesDef, rows: [SeriesEventRow], now: Date = Date()) -> SeriesSchedule {
        let members = rows.filter { row in
            EventSeries.series(title: row.event.title, venue: row.event.venue, location: row.event.location)?.slug
                == def.slug && !isModeratorHidden(row)
        }

        var byDay: [String: SeriesEventRow] = [:]
        for row in members {
            guard let day = centralDay(of: row) else { continue }
            byDay[day] = byDay[day].map { preferred($0, row) } ?? row
        }

        let instances = byDay.keys.sorted().compactMap { day -> SeriesInstance? in
            guard let row = byDay[day] else { return nil }
            return SeriesInstance(
                row: row,
                day: day,
                linkId: isLinkable(row) ? row.event.id : nil,
                isOver: row.event.isOver(at: now)
            )
        }

        var editions: [Int: SeriesEdition] = [:]
        for instance in instances {
            guard let year = Int(instance.day.prefix(4)) else { continue }
            var edition = editions[year]
                ?? SeriesEdition(year: year, instances: [], venues: [], firstDay: instance.day, lastDay: instance.day)
            edition.instances.append(instance)
            let venue = [instance.row.event.venue, instance.row.event.location]
                .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
                .first { !$0.isEmpty }
            if let venue, !edition.venues.contains(venue) { edition.venues.append(venue) }
            let until = runEndDay(instance.row) ?? instance.day
            if until > edition.lastDay { edition.lastDay = until }
            editions[year] = edition
        }
        let ordered = editions.values.sorted { $0.year < $1.year }

        // The earliest edition with a live date still to come. A sweep-hidden
        // row is over by construction, so `!isOver` already excludes it.
        let current = ordered.first { edition in
            edition.instances.contains { !$0.isOver && $0.row.isLive }
        }
        let past = Array(ordered.filter { $0.year != current?.year }.reversed())

        let thisYear = Int(centralDay(now).prefix(4)) ?? 0
        let unannouncedYear: Int? = current == nil
            ? max(ordered.last.map { $0.year + 1 } ?? thisYear, thisYear)
            : nil

        return SeriesSchedule(
            current: current,
            past: past,
            unannouncedYear: unannouncedYear,
            venue: (current ?? past.first)?.venues.first,
            total: instances.count
        )
    }
}
