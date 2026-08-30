import Foundation
import CoreLocation

struct Restaurant: Identifiable, Codable, Hashable {
    let id: String
    let name: String
    var cuisine: String?
    var location: String?
    var city: String?
    var rating: Double?
    var priceRange: String?
    var description: String?
    var phone: String?
    var website: String?
    var imageUrl: String?
    var isFeatured: Bool?
    var latitude: Double?
    var longitude: Double?
    var popularityScore: Double?
    var status: String?
    var slug: String?
    var aiWriteup: String?
    var businessHours: BusinessHours?
    var dietaryOptions: [String]?
    var createdAt: String?
    var updatedAt: String?
    /// First-party sponsored-listing flag (IOS-ADS-011). Set by the backend
    /// while a paid sponsorship is active; `sponsored_until` is informational.
    var isSponsored: Bool?
    var sponsoredUntil: String?

    enum CodingKeys: String, CodingKey {
        case id, name, cuisine, location, city, rating, description, phone, website, status, slug
        case priceRange = "price_range"
        case imageUrl = "image_url"
        case isFeatured = "is_featured"
        case latitude, longitude
        case popularityScore = "popularity_score"
        case aiWriteup = "ai_writeup"
        case businessHours = "business_hours"
        case dietaryOptions = "dietary_options"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case isSponsored = "is_sponsored"
        case sponsoredUntil = "sponsored_until"
    }

    /// Whether this listing currently carries an active paid sponsorship
    /// (IOS-ADS-011). Mirrors the web, which keys off the `is_sponsored` flag.
    var isActivelySponsored: Bool { isSponsored == true }

    // MARK: - Open/Closed Status

    /// Determines if the restaurant is currently open based on business_hours.
    /// Returns nil if hours data is unavailable.
    /// Shared calendar so the "Open Now" filter doesn't allocate Calendar.current
    /// for every restaurant on every toggle/page — the dominant per-call cost on
    /// a 100+ list (IOS-AUDIT-PERF-009). Captures the user's timezone once.
    private static let sharedCalendar = Calendar.current

    func isOpenNow(at date: Date = .now) -> Bool? {
        guard let hours = businessHours else { return nil }

        // One dateComponents call instead of three component(_:from:) calls.
        let parts = Self.sharedCalendar.dateComponents([.weekday, .hour, .minute], from: date)
        guard let weekday = parts.weekday, let hour = parts.hour, let minute = parts.minute else {
            return nil
        }
        let dayName = Self.dayNames[weekday - 1] // 1=Sun, 2=Mon...

        guard let dayHours = hours.hours(for: dayName) else { return nil }

        // The parsed open/close range is memoized by the hours string so the
        // string-splitting + AM/PM parsing doesn't re-run for every restaurant on
        // every "Open Now" evaluation (IOS-AUDIT-PERF-021).
        switch Self.dayRange(for: dayHours) {
        case .closed:
            return false
        case .unknown:
            return nil
        case .open(let open, let close):
            let currentMinutes = hour * 60 + minute
            // Handle overnight hours (close < open means past midnight)
            if close < open {
                return currentMinutes >= open || currentMinutes < close
            }
            return currentMinutes >= open && currentMinutes < close
        }
    }

    /// Parsed open/close minutes for a day's hours string.
    private enum DayRange { case open(Int, Int), closed, unknown }

    private static let rangeCacheLock = NSLock()
    private static var rangeCache: [String: DayRange] = [:]

    /// Memoized parse of a "11:00 AM - 10:00 PM"-style string into minutes.
    /// Thread-safe: the Open Now filter runs on a detached task.
    private static func dayRange(for dayHours: String) -> DayRange {
        rangeCacheLock.lock()
        if let cached = rangeCache[dayHours] {
            rangeCacheLock.unlock()
            return cached
        }
        rangeCacheLock.unlock()

        let computed: DayRange
        let trimmed = dayHours.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty || trimmed.lowercased() == "closed" {
            computed = .closed
        } else {
            let components = dayHours.components(separatedBy: " - ")
            if components.count == 2,
               let open = parseTime(components[0].trimmingCharacters(in: .whitespaces)),
               let close = parseTime(components[1].trimmingCharacters(in: .whitespaces)) {
                computed = .open(open, close)
            } else {
                computed = .unknown
            }
        }

        rangeCacheLock.lock()
        rangeCache[dayHours] = computed
        rangeCacheLock.unlock()
        return computed
    }

    var openStatusText: String {
        switch isOpenNow() {
        case true: return "Open"
        case false: return "Closed"
        case nil: return "Hours unknown"
        }
    }

    private static let dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

    /// Parse time string like "11:00", "11:00 AM", "9:30 PM" to minutes since midnight.
    private static func parseTime(_ string: String) -> Int? {
        let trimmed = string.trimmingCharacters(in: .whitespaces)

        // Try "HH:mm" (24-hour)
        let parts = trimmed.components(separatedBy: ":")
        guard parts.count >= 2, let hour = Int(parts[0]) else { return nil }

        let minutePart = parts[1].trimmingCharacters(in: .letters).trimmingCharacters(in: .whitespaces)
        guard let minute = Int(minutePart) else { return nil }

        var h = hour
        let upper = trimmed.uppercased()
        if upper.hasSuffix("PM") && h != 12 { h += 12 }
        if upper.hasSuffix("AM") && h == 12 { h = 0 }

        return h * 60 + minute
    }

    // MARK: - Computed Properties

    var coordinate: CLLocationCoordinate2D? {
        // A missing coordinate is null in the DB (Double? == nil); a literal 0.0
        // is a valid location and must not be masked (IOS-AUDIT-BUG-016).
        guard let lat = latitude, let lng = longitude else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    var displayDescription: String {
        aiWriteup ?? description ?? ""
    }

    var displayLocation: String {
        [location, city].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
    }

    var ratingText: String {
        guard let rating else { return "No rating" }
        return String(format: "%.1f", rating)
    }

    var priceLevel: Int {
        priceRange?.filter({ $0 == "$" }).count ?? 0
    }

    var callURL: URL? {
        guard let phone, !phone.isEmpty else { return nil }
        let cleaned = phone.replacingOccurrences(of: "[^0-9+]", with: "", options: .regularExpression)
        return URL(string: "tel://\(cleaned)")
    }

    /// Safe http/https website URL only (IOS-AUDIT-SEC-002) — an unsafe scheme
    /// in the content row yields nil so no button renders.
    var websiteURL: URL? {
        website.flatMap { $0.safeWebURL }
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: Restaurant, rhs: Restaurant) -> Bool {
        lhs.id == rhs.id
    }

    // MARK: - Accessibility

    /// Full VoiceOver label for a compact card button (name, cuisine, price range, rating).
    var compactCardAccessibilityLabel: String {
        var parts: [String] = [name]
        if let cuisine { parts.append(cuisine) }
        if let priceRange, !priceRange.isEmpty { parts.append(priceRange) }
        if rating != nil { parts.append("Rated \(ratingText)") }
        return parts.joined(separator: ". ")
    }
}

// MARK: - Business Hours

/// Flexible decoder for the business_hours JSONB column.
/// Supports both `{ "monday": "11:00 - 22:00", ... }` and
/// `{ "hours": { "monday": "..." } }` shapes.
struct BusinessHours: Codable, Hashable {
    private let store: [String: String]

    init(from decoder: Decoder) throws {
        // Try flat { "monday": "...", "tuesday": "..." }
        if let flat = try? decoder.singleValueContainer().decode([String: String].self) {
            store = flat.reduce(into: [:]) { $0[$1.key.lowercased()] = $1.value }
            return
        }
        // Try nested { "hours": { "monday": "..." } }
        if let nested = try? decoder.singleValueContainer().decode([String: [String: String]].self),
           let inner = nested["hours"] {
            store = inner.reduce(into: [:]) { $0[$1.key.lowercased()] = $1.value }
            return
        }
        store = [:]
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(store)
    }

    func hours(for day: String) -> String? {
        store[day.lowercased()]
    }
}

// MARK: - Preview Helpers

extension Restaurant {
    static let preview = Restaurant(
        id: "preview-1",
        name: "Zombie Burger + Drink Lab",
        cuisine: "American",
        location: "300 E Grand Ave",
        city: "Des Moines",
        rating: 4.5,
        priceRange: "$$",
        description: "Creative burgers with horror-themed names and craft cocktails in a fun, quirky atmosphere.",
        phone: "(515) 555-0123",
        website: "https://zombieburger.com",
        isFeatured: true,
        latitude: 41.5910,
        longitude: -93.6088
    )
}
