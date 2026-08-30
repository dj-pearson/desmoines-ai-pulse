import Foundation
import CoreLocation

struct Attraction: Identifiable, Codable, Hashable {
    let id: String
    let name: String
    let type: String
    var location: String?
    var description: String?
    var rating: Double?
    var website: String?
    var imageUrl: String?
    var isFeatured: Bool?
    var latitude: Double?
    var longitude: Double?
    var createdAt: String?
    var updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name, type, location, description, rating, website, latitude, longitude
        case imageUrl = "image_url"
        case isFeatured = "is_featured"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    // MARK: - Computed Properties

    var attractionType: AttractionType {
        AttractionType(rawValue: type) ?? .other
    }

    var coordinate: CLLocationCoordinate2D? {
        // A missing coordinate is null in the DB (Double? == nil); a literal 0.0
        // is a valid location and must not be masked (IOS-AUDIT-BUG-016).
        guard let lat = latitude, let lng = longitude else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    /// Safe http/https website URL only (IOS-AUDIT-SEC-002) — an unsafe scheme
    /// in the content row yields nil so no button renders.
    var websiteURL: URL? {
        website.flatMap { $0.safeWebURL }
    }

    var ratingText: String {
        guard let rating else { return "No rating" }
        return String(format: "%.1f", rating)
    }

    /// Full VoiceOver label for a compact card button (name, type, rating).
    /// Mirrors `Restaurant.compactCardAccessibilityLabel` so the home rails
    /// read consistently (IOS-IA-001).
    var compactCardAccessibilityLabel: String {
        var parts: [String] = [name, attractionType.displayName]
        if rating != nil { parts.append("Rated \(ratingText)") }
        return parts.joined(separator: ". ")
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: Attraction, rhs: Attraction) -> Bool {
        lhs.id == rhs.id
    }
}

extension Attraction {
    static let preview = Attraction(
        id: "preview-1",
        name: "Pappajohn Sculpture Park",
        type: "Park",
        location: "1330 Grand Ave, Des Moines",
        description: "A 4.4-acre park featuring 30+ world-renowned sculptures by internationally acclaimed artists.",
        rating: 4.8,
        website: "https://desmoinesartcenter.org",
        isFeatured: true,
        latitude: 41.5862,
        longitude: -93.6354
    )
}
