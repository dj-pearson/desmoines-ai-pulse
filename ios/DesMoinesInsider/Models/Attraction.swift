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
        guard let lat = latitude, let lng = longitude,
              lat != 0, lng != 0 else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    var websiteURL: URL? {
        guard let website, !website.isEmpty else { return nil }
        if website.hasPrefix("http") { return URL(string: website) }
        return URL(string: "https://\(website)")
    }

    var ratingText: String {
        guard let rating else { return "No rating" }
        return String(format: "%.1f", rating)
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
