import Foundation
import CoreLocation

struct Event: Identifiable, Codable, Hashable {
    let id: String
    let title: String
    let date: String
    var location: String?
    var venue: String?
    var city: String?
    var category: String?
    var price: String?
    var description: String?
    var enhancedDescription: String?
    var originalDescription: String?
    var imageUrl: String?
    var sourceUrl: String?
    var isFeatured: Bool?
    var isEnhanced: Bool?
    var latitude: Double?
    var longitude: Double?
    var aiWriteup: String?
    var eventStartUtc: String?
    var eventStartLocal: String?
    var eventTimezone: String?
    var isRecurring: Bool?
    var seoTitle: String?
    var seoDescription: String?
    var seoKeywords: [String]?
    var createdAt: String?
    var updatedAt: String?
    /// First-party sponsored-listing flag (IOS-ADS-011). Set by the backend
    /// while a paid sponsorship is active; see `isActivelySponsored` for how
    /// `sponsored_until` bounds it.
    var isSponsored: Bool?
    var sponsoredUntil: String?
    /// When a multi-day run ends (end_date, 20260316000002). Nil for a
    /// single-sitting event (IOS-DD-EVENTS-02).
    var endDate: String?
    /// The source said the start time is not announced (time_tbd,
    /// 20260902000016).
    var timeTbd: Bool?
    /// Which ingest path wrote the row, e.g. "seatgeek" or "user_submission".
    var source: String?
    /// GEO content the web detail page already renders (IOS-DD-EVENTS-21).
    var geoSummary: String?
    var geoKeyFacts: [String]?
    var geoFaq: [EventFAQ]?

    enum CodingKeys: String, CodingKey {
        case id, title, date, location, venue, city, category, price
        case description, imageUrl = "image_url"
        case enhancedDescription = "enhanced_description"
        case originalDescription = "original_description"
        case sourceUrl = "source_url"
        case isFeatured = "is_featured"
        case isEnhanced = "is_enhanced"
        case latitude, longitude
        case aiWriteup = "ai_writeup"
        case eventStartUtc = "event_start_utc"
        case eventStartLocal = "event_start_local"
        case eventTimezone = "event_timezone"
        case isRecurring = "is_recurring"
        case seoTitle = "seo_title"
        case seoDescription = "seo_description"
        case seoKeywords = "seo_keywords"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case isSponsored = "is_sponsored"
        case sponsoredUntil = "sponsored_until"
        case endDate = "end_date"
        case timeTbd = "time_tbd"
        case source
        case geoSummary = "geo_summary"
        case geoKeyFacts = "geo_key_facts"
        case geoFaq = "geo_faq"
    }

    // MARK: - Computed Properties

    var eventCategory: EventCategory {
        EventCategory(from: category)
    }

    /// Whether this listing currently carries an active paid sponsorship
    /// (IOS-ADS-011). The flag alone used to decide it, so a sponsorship whose
    /// `sponsored_until` had passed kept the badge and the top slot until a
    /// backend job cleared the flag. The web honours the date; so does this
    /// (IOS-DD-EVENTS-13). No date, or one that does not parse, means the flag
    /// stands.
    var isActivelySponsored: Bool {
        Self.sponsorshipIsActive(isSponsored: isSponsored, sponsoredUntil: sponsoredUntil)
    }

    /// Shared by Event, Restaurant and Attraction so the three rails agree.
    static func sponsorshipIsActive(isSponsored: Bool?, sponsoredUntil: String?, now: Date = Date()) -> Bool {
        guard isSponsored == true else { return false }
        guard let sponsoredUntil, let until = DateParser.parse(sponsoredUntil) else { return true }
        return until > now
    }

    var parsedDate: Date? {
        DateParser.parse(date)
    }

    var parsedEndDate: Date? {
        DateParser.parse(endDate)
    }

    var coordinate: CLLocationCoordinate2D? {
        // A missing coordinate is null in the DB (Double? == nil); a literal 0.0
        // is a valid location and must not be masked (IOS-AUDIT-BUG-016).
        guard let lat = latitude, let lng = longitude else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    /// One definition of free, mirroring src/lib/eventPrice.ts isFreePrice
    /// (IOS-DD-EVENTS-06). Nil means the price is not listed, which is not the
    /// same as free: selling a null price as free is the bug the web retired.
    ///
    /// Text that says "free" is free unless it also names a non-zero dollar
    /// amount ("Free parking, $40 tickets"). Otherwise only a zero amount is.
    static func isFreePrice(_ price: String?) -> Bool? {
        guard let price else { return nil }
        let text = price.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        if text.range(of: "free", options: .caseInsensitive) != nil {
            return text.range(of: #"\$ *[1-9]"#, options: .regularExpression) == nil
        }
        return text.range(of: #"^\$?0(\.0+)?$"#, options: .regularExpression) != nil
    }

    var isFree: Bool {
        Event.isFreePrice(price) == true
    }

    var displayDescription: String {
        enhancedDescription ?? aiWriteup ?? originalDescription ?? description ?? ""
    }

    var displayLocation: String {
        let venueCityStr = [venue, city].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
        return venueCityStr.isEmpty ? (location ?? "Des Moines") : venueCityStr
    }

    /// Whether the row carries a real start time, mirroring src/lib/timezone.ts
    /// hasSpecificTime (IOS-DD-EVENTS-05). False for an explicit time_tbd, for
    /// SeatGeek's 03:30 placeholder, and for the 19:31:58 no-time marker, so
    /// none of them prints as a showtime or drives a reminder.
    var hasSpecificTime: Bool {
        if timeTbd == true { return false }
        let fromSeatGeek = [source, sourceUrl].contains { value in
            value?.range(of: "seatgeek", options: .caseInsensitive) != nil
        }
        if fromSeatGeek, let start = parsedDate,
           DesMoinesTime.localTimeString(start) == DesMoinesTime.seatGeekPlaceholder {
            return false
        }
        if let local = eventStartLocal, let tIndex = local.firstIndex(of: "T") {
            let time = String(local[local.index(after: tIndex)...].prefix(8))
            return time != DesMoinesTime.noTimeMarker
        }
        if let start = parsedDate, DesMoinesTime.localTimeString(start) == DesMoinesTime.noTimeMarker {
            return false
        }
        return true
    }

    /// Started and not over. A row with no end_date is assumed to run three
    /// hours, as the web does.
    func happeningNow(at now: Date = Date()) -> Bool {
        guard let start = parsedDate, hasSpecificTime else { return false }
        let end = parsedEndDate ?? start.addingTimeInterval(3 * 3600)
        return start <= now && now < end
    }

    var isHappeningNow: Bool { happeningNow() }

    /// Whether the event has ended (IOS-DD-SAVED-10). The Saved tab filed
    /// anything that had started as "Past event", including a show on right
    /// now, an untimed event today and a festival in its second day.
    ///
    /// Timed: over at end_date, else three hours after the start (the web's
    /// rule, as in `happeningNow`). Untimed: over at the start of the Des
    /// Moines day after its last day. An end_date at exactly 00:00:00 Central
    /// is a date with no time, so the whole of that day counts. No date means
    /// not over.
    func isOver(at now: Date, calendar: Calendar = DesMoinesTime.calendar) -> Bool {
        guard let start = parsedDate else { return false }
        func dayAfter(_ date: Date) -> Date {
            calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: date)) ?? date
        }
        var end: Date
        if hasSpecificTime {
            end = parsedEndDate ?? start.addingTimeInterval(3 * 3600)
        } else {
            end = dayAfter(parsedEndDate ?? start)
        }
        if let endDate = parsedEndDate {
            let parts = calendar.dateComponents([.hour, .minute, .second], from: endDate)
            if parts.hour == 0, parts.minute == 0, parts.second == 0 {
                end = max(end, dayAfter(endDate))
            }
        }
        return end <= now
    }

    var urgencyLabel: String? {
        urgency(at: Date(), calendar: DesMoinesTime.calendar)
    }

    /// Day words in Des Moines time, so "Today" means today in Des Moines
    /// rather than on the phone's clock (IOS-DD-EVENTS-05).
    func urgency(at now: Date, calendar: Calendar = DesMoinesTime.calendar) -> String? {
        guard let eventDate = parsedDate else { return nil }
        if happeningNow(at: now) { return "Happening now" }

        let today = calendar.startOfDay(for: now)
        let eventDay = calendar.startOfDay(for: eventDate)
        let days = calendar.dateComponents([.day], from: today, to: eventDay).day ?? 0
        if days == 0 { return "Today" }
        if days == 1 { return "Tomorrow" }
        if days > 1 && days <= 7 { return "In \(days) days" }
        return nil
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: Event, rhs: Event) -> Bool {
        lhs.id == rhs.id
    }

    // MARK: - Accessibility

    /// Full VoiceOver label for a featured card button (title, category, date, price).
    var featuredCardAccessibilityLabel: String {
        var parts: [String] = [title, eventCategory.displayName]
        if let date = parsedDate {
            parts.append(date.formatted(DesMoinesTime.style(.dateTime.weekday(.wide).month(.wide).day())))
        }
        if isFree { parts.append("Free event") }
        else if let price, !price.isEmpty { parts.append(price) }
        return parts.joined(separator: ". ")
    }

    /// Label for a rail NavigationLink wrapping a decorative card. The card's
    /// urgency pill is hidden from VoiceOver, so its words ("Happening now",
    /// "Today") go in the label (IOS-DD-EVENTS-18), and a paid placement says
    /// so first. Shared by Home and the Weekend guide (IOS-DD-BROWSE-07).
    var railAccessibilityLabel: String {
        var label = featuredCardAccessibilityLabel
        if let urgency = urgencyLabel { label = "\(urgency). " + label }
        return isActivelySponsored ? "Sponsored. " + label : label
    }
}

// MARK: - FAQ

/// One entry of `events.geo_faq` (jsonb).
struct EventFAQ: Codable, Hashable {
    let question: String
    let answer: String
}

// MARK: - Tolerant decoding (IOS-DD-EVENTS-23)

extension Event {
    /// title and date are nullable in the table (baseline_tables.sql) with no
    /// later NOT NULL, and a page decodes as one array, so a single null title
    /// used to fail the whole feed. They now fall back instead. geo_faq is
    /// jsonb, so a shape other than [{question, answer}] becomes nil rather
    /// than failing the row.
    ///
    /// In an extension so the memberwise initialiser the previews use survives.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? "Untitled event"
        date = try c.decodeIfPresent(String.self, forKey: .date) ?? ""
        location = try c.decodeIfPresent(String.self, forKey: .location)
        venue = try c.decodeIfPresent(String.self, forKey: .venue)
        city = try c.decodeIfPresent(String.self, forKey: .city)
        category = try c.decodeIfPresent(String.self, forKey: .category)
        price = try c.decodeIfPresent(String.self, forKey: .price)
        description = try c.decodeIfPresent(String.self, forKey: .description)
        enhancedDescription = try c.decodeIfPresent(String.self, forKey: .enhancedDescription)
        originalDescription = try c.decodeIfPresent(String.self, forKey: .originalDescription)
        imageUrl = try c.decodeIfPresent(String.self, forKey: .imageUrl)
        sourceUrl = try c.decodeIfPresent(String.self, forKey: .sourceUrl)
        isFeatured = try c.decodeIfPresent(Bool.self, forKey: .isFeatured)
        isEnhanced = try c.decodeIfPresent(Bool.self, forKey: .isEnhanced)
        latitude = try c.decodeIfPresent(Double.self, forKey: .latitude)
        longitude = try c.decodeIfPresent(Double.self, forKey: .longitude)
        aiWriteup = try c.decodeIfPresent(String.self, forKey: .aiWriteup)
        eventStartUtc = try c.decodeIfPresent(String.self, forKey: .eventStartUtc)
        eventStartLocal = try c.decodeIfPresent(String.self, forKey: .eventStartLocal)
        eventTimezone = try c.decodeIfPresent(String.self, forKey: .eventTimezone)
        isRecurring = try c.decodeIfPresent(Bool.self, forKey: .isRecurring)
        seoTitle = try c.decodeIfPresent(String.self, forKey: .seoTitle)
        seoDescription = try c.decodeIfPresent(String.self, forKey: .seoDescription)
        seoKeywords = try? c.decodeIfPresent([String].self, forKey: .seoKeywords)
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt)
        updatedAt = try c.decodeIfPresent(String.self, forKey: .updatedAt)
        isSponsored = try c.decodeIfPresent(Bool.self, forKey: .isSponsored)
        sponsoredUntil = try c.decodeIfPresent(String.self, forKey: .sponsoredUntil)
        endDate = try c.decodeIfPresent(String.self, forKey: .endDate)
        timeTbd = try c.decodeIfPresent(Bool.self, forKey: .timeTbd)
        source = try c.decodeIfPresent(String.self, forKey: .source)
        geoSummary = try c.decodeIfPresent(String.self, forKey: .geoSummary)
        geoKeyFacts = try? c.decodeIfPresent([String].self, forKey: .geoKeyFacts)
        geoFaq = try? c.decodeIfPresent([EventFAQ].self, forKey: .geoFaq)
    }
}

/// A page of events that drops rows that cannot decode instead of failing the
/// page (IOS-DD-EVENTS-23). A row with no id is the only thing Event itself
/// still refuses.
struct LossyEventArray: Decodable {
    let events: [Event]
    let droppedCount: Int

    private struct AnyDecodableEvent: Decodable {
        let event: Event?
        init(from decoder: Decoder) throws {
            event = try? Event(from: decoder)
        }
    }

    init(from decoder: Decoder) throws {
        let rows = try [AnyDecodableEvent](from: decoder)
        let decoded = rows.compactMap(\.event)
        let dropped = rows.count - decoded.count
        events = decoded
        droppedCount = dropped
        // A local, not self.droppedCount: the log interpolation is an escaping
        // autoclosure, which cannot capture self inside a struct initialiser.
        if dropped > 0 {
            AppLogger.general.warning("Dropped \(dropped) undecodable event row(s)")
        }
    }
}

// MARK: - Preview Helpers

extension Event {
    static let preview = Event(
        id: "preview-1",
        title: "Downtown Farmers Market",
        date: ISO8601DateFormatter().string(from: Date()),
        location: "Court Avenue, Des Moines",
        venue: "Historic Court District",
        city: "Des Moines",
        category: "Food",
        price: "Free",
        description: "The Downtown Des Moines Farmers' Market is one of the largest in the country. Browse fresh produce, artisan goods, and enjoy live entertainment.",
        imageUrl: nil,
        isFeatured: true,
        latitude: 41.5868,
        longitude: -93.625
    )

    static let previewList: [Event] = [
        .preview,
        Event(id: "preview-2", title: "Jazz in July Concert", date: ISO8601DateFormatter().string(from: Date().addingTimeInterval(86400)),
              location: "Simon Estes Amphitheater", venue: "Simon Estes Amphitheater", city: "Des Moines",
              category: "Music", price: "$15", isFeatured: false, latitude: 41.584, longitude: -93.629),
        Event(id: "preview-3", title: "Des Moines Art Festival", date: ISO8601DateFormatter().string(from: Date().addingTimeInterval(172800)),
              location: "Western Gateway Park", city: "Des Moines", category: "Arts", price: "Free",
              isFeatured: true, latitude: 41.587, longitude: -93.639),
    ]
}
