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
    }

    // MARK: - Computed Properties

    var eventCategory: EventCategory {
        EventCategory(from: category)
    }

    var parsedDate: Date? {
        // Try ISO 8601 first
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = iso.date(from: date) { return date }

        // Try without fractional seconds
        iso.formatOptions = [.withInternetDateTime]
        if let date = iso.date(from: self.date) { return date }

        // Try common formats
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        for format in ["yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd"] {
            formatter.dateFormat = format
            if let date = formatter.date(from: self.date) { return date }
        }
        return nil
    }

    var coordinate: CLLocationCoordinate2D? {
        guard let lat = latitude, let lng = longitude,
              lat != 0, lng != 0 else { return nil }
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
