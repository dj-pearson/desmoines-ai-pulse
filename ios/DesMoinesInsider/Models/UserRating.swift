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
    /// approved / pending / rejected (group 1 moderation). Nil on rows from an
    /// older select; treated as approved.
    var moderationStatus: String?
    var createdAt: String?
    var updatedAt: String?
    /// Short public name ("Dana M.") from the review_author_names RPC, filled
    /// in after decoding. Not a column, so not in CodingKeys (IOS-DD-GUIDES-02).
    var authorDisplayName: String? = nil

    enum CodingKeys: String, CodingKey {
        case id, rating
        case contentId = "content_id"
        case contentType = "content_type"
        case userId = "user_id"
        case reviewText = "review_text"
        case moderationStatus = "moderation_status"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    func hash(into hasher: inout Hasher) { hasher.combine(id) }
    static func == (lhs: UserRating, rhs: UserRating) -> Bool { lhs.id == rhs.id }

    // MARK: - Display

    var ratingValue: Int { Int(rating) ?? 0 }

    /// Never the brand name: a review signed "Des Moines Insider" reads as
    /// the publication vouching for it (IOS-DD-GUIDES-02).
    var authorName: String {
        let name = authorDisplayName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return name.isEmpty ? "Local reviewer" : name
    }

    /// The format review_author_names() builds in SQL: first name plus last
    /// initial ("Dana M."), first name alone, or nil when there's no first name.
    static func shortName(first: String?, last: String?) -> String? {
        let f = first?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !f.isEmpty else { return nil }
        let l = last?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard let initial = l.first else { return f }
        return "\(f) \(String(initial).uppercased())."
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
