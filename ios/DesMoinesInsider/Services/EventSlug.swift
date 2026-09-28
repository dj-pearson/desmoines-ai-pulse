import Foundation

/// The web's event URL is /events/<title-slug>-<yyyy-mm-dd> (Central date of
/// the start), built by createEventSlugWithCentralTime in src/lib/timezone.ts
/// and resolved by pickSlugCandidate in src/hooks/useEventBySlug.ts. Events
/// have no slug column, so a slug is resolved by fetching the rows on its day
/// and matching (IOS-DD-PLATFORM-01).
///
/// Foundation plus DesMoinesTime only: the App Clip compiles this file too.
enum EventSlug {
    /// Lowercase, runs of anything but [a-z0-9] become one "-", no leading or
    /// trailing "-". Mirrors the web's title slug.
    static func titleSlug(_ title: String?) -> String {
        let lowered = (title ?? "").lowercased()
        let dashed = lowered.replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
        return dashed.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }

    /// The canonical slug: the title slug plus the Central date of `start`,
    /// or the bare title slug when there is no start.
    static func slug(title: String?, start: Date?) -> String {
        let base = titleSlug(title)
        guard let start else { return base }
        let c = DesMoinesTime.calendar.dateComponents([.year, .month, .day], from: start)
        guard let y = c.year, let m = c.month, let d = c.day else { return base }
        return base + "-" + String(format: "%04d-%02d-%02d", y, m, d)
    }

    /// The trailing yyyy-mm-dd of a slug, if it has one.
    static func parseDate(_ slug: String) -> (y: Int, m: Int, d: Int)? {
        guard let range = slug.range(of: "-(\\d{4})-(\\d{2})-(\\d{2})$", options: .regularExpression) else { return nil }
        let parts = slug[range].dropFirst().split(separator: "-")
        guard parts.count == 3, let y = Int(parts[0]), let m = Int(parts[1]), let d = Int(parts[2]) else { return nil }
        return (y, m, d)
    }

    /// The slug without its "-yyyy-mm-dd" suffix.
    static func titlePart(_ slug: String) -> String {
        guard parseDate(slug) != nil else { return slug }
        return String(slug.dropLast(11))
    }

    struct Candidate: Equatable {
        let id: String
        let title: String?
        let start: Date?
    }

    /// Which candidate a slug names, or nil (a port of pickSlugCandidate):
    /// 1. the exact slug;
    /// 2. a stale date: exactly one candidate has the same title slug (more
    ///    than one is ambiguous, nil);
    /// 3. a retitled row: exactly one candidate on the slug's day, and it
    ///    shares a word of 3+ characters with the slug.
    /// A dateless slug returns nil here.
    static func pick(_ slug: String, from candidates: [Candidate]) -> Candidate? {
        if let exact = candidates.first(where: { Self.slug(title: $0.title, start: $0.start) == slug }) {
            return exact
        }
        guard let date = parseDate(slug) else { return nil }
        let titlePart = titlePart(slug)

        let sameTitle = candidates.filter { titleSlug($0.title) == titlePart }
        if sameTitle.count == 1 { return sameTitle[0] }
        if sameTitle.count > 1 { return nil }

        let wanted = significantWords(titlePart)
        guard !wanted.isEmpty else { return nil }
        let suffix = String(format: "-%04d-%02d-%02d", date.y, date.m, date.d)
        let sameDay = candidates.filter { Self.slug(title: $0.title, start: $0.start).hasSuffix(suffix) }
        let overlapping = sameDay.filter { !significantWords(titleSlug($0.title)).isDisjoint(with: wanted) }
        return sameDay.count == 1 && overlapping.count == 1 ? overlapping[0] : nil
    }

    private static func significantWords(_ titleSlug: String) -> Set<String> {
        Set(titleSlug.split(separator: "-").map(String.init).filter { $0.count >= 3 })
    }

    // MARK: - Link segments

    /// /events/<segment> landing pages on the web (src/App.tsx), which are
    /// not events.
    static let landingSegments: Set<String> = [
        "today", "this-weekend", "near-me", "free", "kids", "date-night",
        "west-des-moines", "ankeny", "urbandale", "johnston", "altoona",
        "clive", "windsor-heights", "waukee",
    ]

    /// /events/<month>-<year>, the web's monthly archive pages.
    static func isMonthPage(_ s: String) -> Bool {
        s.range(
            of: "^(january|february|march|april|may|june|july|august|september|october|november|december)-\\d{4}$",
            options: .regularExpression
        ) != nil
    }

    /// A UUID, or a lowercase slug of at most 160 characters that is not a
    /// landing or month page. Nil otherwise.
    static func linkId(_ raw: String) -> String? {
        if UUID(uuidString: raw) != nil { return raw }
        guard !landingSegments.contains(raw), !isMonthPage(raw), raw.count <= 160,
              raw.range(of: "^[a-z0-9]+(?:-[a-z0-9]+)*$", options: .regularExpression) != nil else { return nil }
        return raw
    }

    /// The [day - 1, day + 2) window, in Central time, that a slug's rows are
    /// fetched from: the slug's date is the Central date of the start, which
    /// can sit either side of the stored `date` across midnight UTC.
    static func dayWindow(_ date: (y: Int, m: Int, d: Int)) -> (from: Date, to: Date)? {
        let cal = DesMoinesTime.calendar
        guard let midnight = cal.date(from: DateComponents(year: date.y, month: date.m, day: date.d)),
              let from = cal.date(byAdding: .day, value: -1, to: midnight),
              let to = cal.date(byAdding: .day, value: 2, to: midnight) else { return nil }
        return (from, to)
    }
}
