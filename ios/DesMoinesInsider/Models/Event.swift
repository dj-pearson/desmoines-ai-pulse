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
    /// while a paid sponsorship is active; `sponsored_until` is informational.
    var isSponsored: Bool?
    var sponsoredUntil: String?

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
    }

    // MARK: - Computed Properties

    var eventCategory: EventCategory {
        EventCategory(from: category)
    }

    /// Whether this listing currently carries an active paid sponsorship
    /// (IOS-ADS-011). Mirrors the web, which keys off the `is_sponsored` flag
    /// the backend maintains; `sponsored_until` is exposed for display/debugging.
    var isActivelySponsored: Bool { isSponsored == true }

    var parsedDate: Date? {
        DateParser.parse(date)
    }

    var coordinate: CLLocationCoordinate2D? {
        // A missing coordinate is null in the DB (Double? == nil); a literal 0.0
        // is a valid location and must not be masked (IOS-AUDIT-BUG-016).
        guard let lat = latitude, let lng = longitude else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    var isFree: Bool {
        guard let price = price?.lowercased() else { return false }
        return price == "free" || price == "$0" || price == "0" || price.isEmpty
    }

    var displayDescription: String {
        enhancedDescription ?? aiWriteup ?? originalDescription ?? description ?? ""
    }

    var displayLocation: String {
        let venueCityStr = [venue, city].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
        return venueCityStr.isEmpty ? (location ?? "Des Moines") : venueCityStr
    }

    var urgencyLabel: String? {
        guard let eventDate = parsedDate else { return nil }
        let calendar = Calendar.current
        let now = Date()

        if calendar.isDateInToday(eventDate) { return "Today" }
        if calendar.isDateInTomorrow(eventDate) { return "Tomorrow" }

        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: calendar.startOfDay(for: eventDate)).day ?? 0
        if days > 0 && days <= 7 { return "In \(days) days" }
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
            parts.append(date.formatted(.dateTime.weekday(.wide).month(.wide).day()))
        }
        if isFree { parts.append("Free event") }
        else if let price, !price.isEmpty { parts.append(price) }
        return parts.joined(separator: ". ")
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
        category: "Food & Drink",
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
              location: "Western Gateway Park", city: "Des Moines", category: "Art & Culture", price: "Free",
              isFeatured: true, latitude: 41.587, longitude: -93.639),
    ]
}
