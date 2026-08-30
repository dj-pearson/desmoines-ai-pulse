import Foundation

/// A "Best Of" voting category (mirrors the web `voting_categories` table /
/// useVoting.ts). IOS-PARITY-005.
struct VotingCategory: Identifiable, Codable, Hashable {
    let id: String
    let name: String
    let slug: String
    var description: String?
    var icon: String?
    var isActive: Bool?
    var votingStart: String?
    var votingEnd: String?
    var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name, slug, description, icon
        case isActive = "is_active"
        case votingStart = "voting_start"
        case votingEnd = "voting_end"
        case createdAt = "created_at"
    }

    /// Vote count is aggregated separately (not a table column), so it's set by
    /// the service after fetch rather than decoded.
    var voteCount: Int = 0

    func hash(into hasher: inout Hasher) { hasher.combine(id) }
    static func == (lhs: VotingCategory, rhs: VotingCategory) -> Bool { lhs.id == rhs.id }

    /// Maps the web's lucide icon names to SF Symbols, with a trophy fallback.
    var systemImage: String {
        switch (icon ?? "").lowercased() {
        case "pizza": return "fork.knife"
        case "coffee": return "cup.and.saucer.fill"
        case "beer": return "mug.fill"
        case "egg": return "fork.knife.circle"
        case "heart": return "heart.fill"
        case "gem": return "diamond.fill"
        case "truck": return "truck.box.fill"
        case "icecream": return "snowflake"
        case "music": return "music.note"
        case "wine": return "wineglass.fill"
        default: return "trophy.fill"
        }
    }

    /// Whether voting is currently open (within the start/end window).
    var isVotingOpen: Bool {
        let now = Date()
        if let endStr = votingEnd, let end = Article.parseTimestamp(endStr), now > end {
            return false
        }
        return isActive ?? true
    }
}

/// The current user's vote in a category (mirrors a row of the `votes` table).
struct Vote: Identifiable, Codable, Hashable {
    let id: String
    let categoryId: String
    let entityType: String
    var entityId: String?
    var customEntry: String?
    let userId: String
    var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case categoryId = "category_id"
        case entityType = "entity_type"
        case entityId = "entity_id"
        case customEntry = "custom_entry"
        case userId = "user_id"
        case createdAt = "created_at"
    }

    /// Stable key for matching a vote to an aggregated result row.
    var resultKey: String { entityId ?? customEntry ?? "unknown" }
}

/// An aggregated leaderboard row for a category. Built client-side from `votes`,
/// then enriched with restaurant/attraction names + images (same as useVoting).
struct VoteResult: Identifiable, Hashable {
    let entityType: String
    let entityId: String?
    let customEntry: String?
    var voteCount: Int
    var name: String?
    var imageUrl: String?

    /// Stable identity used for ForEach + matching the user's vote.
    var id: String { entityId ?? customEntry ?? "\(entityType)-unknown" }

    var displayName: String { name ?? customEntry ?? "Unknown" }

    var placeholderEmoji: String {
        switch entityType {
        case "restaurant": return "🍽️"
        case "attraction": return "⭐"
        case "event": return "🎟️"
        default: return "✏️"
        }
    }
}

extension VoteResult {
    /// A raw vote row (entity_type / entity_id / custom_entry) used for
    /// aggregation. Decoupled from the network layer so ranking is testable.
    struct Raw {
        let entityType: String
        let entityId: String?
        let customEntry: String?
    }

    /// Aggregates raw votes into descending-by-count results, keyed by
    /// entity id (or custom entry). Mirrors the web useVoting aggregation.
    static func aggregate(_ rows: [Raw]) -> [VoteResult] {
        var map: [String: VoteResult] = [:]
        for v in rows {
            let key = v.entityId ?? v.customEntry ?? "unknown"
            if var existing = map[key] {
                existing.voteCount += 1
                map[key] = existing
            } else {
                map[key] = VoteResult(
                    entityType: v.entityType,
                    entityId: v.entityId,
                    customEntry: v.customEntry,
                    voteCount: 1
                )
            }
        }
        return Array(map.values).sorted { $0.voteCount > $1.voteCount }
    }
}

/// A searchable nominee (restaurant or attraction) used when casting a vote.
struct VoteNominee: Identifiable, Hashable {
    let id: String
    let name: String
    let type: String  // "restaurant" | "attraction"
    var imageUrl: String?
}
