import Foundation

/// A user rating + review (IOS-PARITY-009), decoding the `user_ratings` table
/// the web useRatings hook uses. One row per (user, content_type, content_id).
/// `rating` is the `rating_value` enum, stored as a string "1"…"5".
struct UserRating: Identifiable, Codable, Hashable {
    let id: String
    let contentId: String
    let contentType: String
    let userId: String
    let rating: String
    var reviewText: String?
    var isVerified: Bool?
    var createdAt: String?
    var updatedAt: String?
    /// Joined author profile (select `profiles:user_id (...)`).
    var profiles: Author?

    struct Author: Codable, Hashable {
        var firstName: String?
        var lastName: String?
        enum CodingKeys: String, CodingKey {
            case firstName = "first_name"
            case lastName = "last_name"
        }
    }

    enum CodingKeys: String, CodingKey {
        case id, rating, profiles
        case contentId = "content_id"
        case contentType = "content_type"
        case userId = "user_id"
        case reviewText = "review_text"
        case isVerified = "is_verified"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    func hash(into hasher: inout Hasher) { hasher.combine(id) }
    static func == (lhs: UserRating, rhs: UserRating) -> Bool { lhs.id == rhs.id }

    // MARK: - Display

    var ratingValue: Int { Int(rating) ?? 0 }

    var authorName: String {
        let first = profiles?.firstName?.trimmingCharacters(in: .whitespaces) ?? ""
        let last = profiles?.lastName?.trimmingCharacters(in: .whitespaces) ?? ""
        let full = [first, last].filter { !$0.isEmpty }.joined(separator: " ")
        return full.isEmpty ? "Des Moines Insider" : full
    }

    var date: Date? { Article.parseTimestamp(updatedAt) ?? Article.parseTimestamp(createdAt) }

    var formattedDate: String? {
        guard let date else { return nil }
        return date.formatted(.dateTime.month(.abbreviated).day().year())
    }
}

/// Aggregate rating stats for a piece of content (content_rating_aggregates).
struct ContentRatingAggregate: Codable {
    var averageRating: Double?
    var totalRatings: Int?

    enum CodingKeys: String, CodingKey {
        case averageRating = "average_rating"
        case totalRatings = "total_ratings"
    }
}
