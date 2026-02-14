import Foundation

struct UserProfile: Identifiable, Codable {
    let id: String
    let userId: String
    var firstName: String?
    var lastName: String?
    var email: String?
    var phone: String?
    var location: String?
    var interests: [String]?
    var userRole: String?
    var createdAt: String
    var updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case firstName = "first_name"
        case lastName = "last_name"
        case email, phone, location, interests
        case userRole = "user_role"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    var displayName: String {
        let parts = [firstName, lastName].compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? (email ?? "User") : parts.joined(separator: " ")
    }

    var initials: String {
        let first = firstName?.first.map(String.init) ?? ""
        let last = lastName?.first.map(String.init) ?? ""
        let result = "\(first)\(last)"
        return result.isEmpty ? "?" : result.uppercased()
    }

    var role: UserRole {
        UserRole(rawValue: userRole ?? "user") ?? .user
    }
}

// MARK: - User Event Interaction (Favorites)

struct UserEventInteraction: Codable {
    let id: String?
    let userId: String
    let eventId: String
    let interactionType: String
    var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case eventId = "event_id"
        case interactionType = "interaction_type"
        case createdAt = "created_at"
    }
}

// MARK: - User Rating

struct UserRating: Codable {
    let id: String?
    let userId: String
    let contentId: String
    let contentType: String
    let rating: String
    var reviewText: String?
    var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case contentId = "content_id"
        case contentType = "content_type"
        case rating
        case reviewText = "review_text"
        case createdAt = "created_at"
    }
}

// MARK: - Preview Helpers

extension UserProfile {
    static let preview = UserProfile(
        id: "preview-1",
        userId: "user-1",
        firstName: "Jordan",
        lastName: "Smith",
        email: "jordan@example.com",
        phone: "(515) 555-0100",
        location: "Des Moines",
        interests: ["Food", "Music", "Outdoor"],
        userRole: "user",
        createdAt: ISO8601DateFormatter().string(from: Date()),
        updatedAt: ISO8601DateFormatter().string(from: Date())
    )
}
