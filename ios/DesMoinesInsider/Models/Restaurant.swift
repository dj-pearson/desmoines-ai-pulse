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
    var createdAt: String?
    var updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name, cuisine, location, city, rating, description, phone, website, status, slug
        case priceRange = "price_range"
        case imageUrl = "image_url"
        case isFeatured = "is_featured"
        case latitude, longitude
        case popularityScore = "popularity_score"
        case aiWriteup = "ai_writeup"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    // MARK: - Computed Properties

    var coordinate: CLLocationCoordinate2D? {
        guard let lat = latitude, let lng = longitude,
              lat != 0, lng != 0 else { return nil }
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

    var websiteURL: URL? {
        guard let website, !website.isEmpty else { return nil }
        if website.hasPrefix("http") { return URL(string: website) }
        return URL(string: "https://\(website)")
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: Restaurant, rhs: Restaurant) -> Bool {
        lhs.id == rhs.id
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
