import Foundation

/// A saved search (IOS-PARITY-008), decoding the `saved_searches` table the web
/// uses (id, user_id, name, filters JSONB, use_count, last_used, timestamps).
/// The query + tab + alert flag live inside the `filters` JSON so we reuse the
/// existing schema without new columns.
struct SavedSearch: Identifiable, Codable, Hashable {
    let id: String
    let userId: String
    var name: String
    var filters: SavedSearchFilters
    var useCount: Int?
    var lastUsed: String?
    var createdAt: String?
    var updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name, filters
        case userId = "user_id"
        case useCount = "use_count"
        case lastUsed = "last_used"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    func hash(into hasher: inout Hasher) { hasher.combine(id) }
    static func == (lhs: SavedSearch, rhs: SavedSearch) -> Bool { lhs.id == rhs.id }

    var alertsEnabled: Bool { filters.alertsEnabled }
    var query: String { filters.query }
}

/// The saved query payload stored in `saved_searches.filters` (JSONB).
struct SavedSearchFilters: Codable, Hashable {
    var query: String
    var tab: String?
    var alertsEnabled: Bool

    init(query: String, tab: String? = nil, alertsEnabled: Bool = false) {
        self.query = query
        self.tab = tab
        self.alertsEnabled = alertsEnabled
    }

    enum CodingKeys: String, CodingKey {
        case query, tab
        case alertsEnabled = "alerts_enabled"
    }

    /// Tolerant decode — older/foreign rows may omit fields.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        query = (try? c.decode(String.self, forKey: .query)) ?? ""
        tab = try? c.decodeIfPresent(String.self, forKey: .tab)
        alertsEnabled = (try? c.decode(Bool.self, forKey: .alertsEnabled)) ?? false
    }
}
