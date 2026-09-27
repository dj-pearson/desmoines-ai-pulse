import Foundation

/// A saved search (IOS-PARITY-008), decoding the `saved_searches` table the web
/// uses (id, user_id, name, filters JSONB, search_type, alerts_enabled,
/// use_count, last_used, timestamps).
///
/// Two clients write this table and they disagree on the `filters` keys
/// (IOS-DD-SEARCH-09). iOS wrote `{query, tab, alerts_enabled}`; the web writes
/// `{q, category, location, price, preset, sort}` with the alert flag in the
/// top-level `alerts_enabled` column (src/lib/savedSearchFilters.ts). The row is
/// therefore decoded twice: into the typed `filters`, and into `rawFilters`, a
/// verbatim copy that a write merges into so no key the web wrote is lost.
struct SavedSearch: Identifiable, Codable, Hashable {
    let id: String
    let userId: String
    var name: String
    var filters: SavedSearchFilters
    /// Every key of `filters` exactly as stored.
    var rawFilters: [String: SavedSearchJSON]
    /// `search_type`. The nightly alert job reads only 'event_list'.
    var searchType: String?
    /// The top-level `alerts_enabled` column, which is what the job reads.
    var topAlertsEnabled: Bool?
    var useCount: Int?
    var lastUsed: String?
    var createdAt: String?
    var updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name, filters
        case userId = "user_id"
        case searchType = "search_type"
        case topAlertsEnabled = "alerts_enabled"
        case useCount = "use_count"
        case lastUsed = "last_used"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        userId = try c.decode(String.self, forKey: .userId)
        name = try c.decode(String.self, forKey: .name)
        filters = (try? c.decode(SavedSearchFilters.self, forKey: .filters)) ?? SavedSearchFilters(query: "")
        rawFilters = (try? c.decode([String: SavedSearchJSON].self, forKey: .filters)) ?? [:]
        searchType = try? c.decodeIfPresent(String.self, forKey: .searchType)
        topAlertsEnabled = try? c.decodeIfPresent(Bool.self, forKey: .topAlertsEnabled)
        useCount = try? c.decodeIfPresent(Int.self, forKey: .useCount)
        lastUsed = try? c.decodeIfPresent(String.self, forKey: .lastUsed)
        createdAt = try? c.decodeIfPresent(String.self, forKey: .createdAt)
        updatedAt = try? c.decodeIfPresent(String.self, forKey: .updatedAt)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(userId, forKey: .userId)
        try c.encode(name, forKey: .name)
        if rawFilters.isEmpty {
            try c.encode(filters, forKey: .filters)
        } else {
            try c.encode(rawFilters, forKey: .filters)
        }
        try c.encodeIfPresent(searchType, forKey: .searchType)
        try c.encodeIfPresent(topAlertsEnabled, forKey: .topAlertsEnabled)
        try c.encodeIfPresent(useCount, forKey: .useCount)
        try c.encodeIfPresent(lastUsed, forKey: .lastUsed)
        try c.encodeIfPresent(createdAt, forKey: .createdAt)
        try c.encodeIfPresent(updatedAt, forKey: .updatedAt)
    }

    func hash(into hasher: inout Hasher) { hasher.combine(id) }
    static func == (lhs: SavedSearch, rhs: SavedSearch) -> Bool { lhs.id == rhs.id }

    /// The top-level column when present (what the job reads), else the
    /// flag iOS used to keep inside `filters`.
    ///
    /// Only for an event_list row: the column is `NOT NULL DEFAULT true`
    /// (20260623000003), so every iOS row written before IOS-AUDIT-FEAT-024
    /// reads true there while its own flag says false, and the job never
    /// reads an 'advanced' row anyway.
    var alertsEnabled: Bool {
        isAlertEligible ? (topAlertsEnabled ?? filters.alertsEnabled) : filters.alertsEnabled
    }

    /// An iOS Events-tab search stored as 'advanced' before FEAT-024. Turning
    /// its alerts on promotes it to 'event_list'.
    var promotesToEventList: Bool {
        !isAlertEligible && filters.tab == "Events"
    }

    /// The words, from whichever key the writer used: iOS `query`, web `q`,
    /// or the `/events` URL's `search` (savedSearchMatch.ts readSavedSearch).
    var query: String {
        for key in ["query", "q", "search"] {
            if let text = Self.setString(rawFilters[key]) { return text }
        }
        return filters.query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Only event_list rows get alert emails (saved-search-alerts/index.ts).
    var isAlertEligible: Bool { searchType == "event_list" }

    /// The web's structured keys as search filters (IOS-DD-SEARCH-09).
    var structuredFilters: SearchFilters {
        var out = SearchFilters()
        if let raw = Self.setString(rawFilters["category"]) {
            let category = EventCategory(from: raw)
            if category != .other || raw.lowercased() == "other" { out.category = category }
        }
        if let preset = Self.setString(rawFilters["preset"]) {
            var datePreset = SearchQueryParser.preset(slug: preset)
            // Tonight has no slug and is saved as "today". When the words still
            // say tonight, re-running on iOS keeps the narrower window instead
            // of widening "Live music tonight" to all of today.
            if datePreset == .today, SearchQueryParser.parse(query).filters.datePreset == .tonight {
                datePreset = .tonight
            }
            out.datePreset = datePreset
        }
        if Self.setString(rawFilters["price"])?.lowercased() == "free" {
            out.freeOnly = true
        }
        let location = Self.setString(rawFilters["location"]) ?? Self.setString(rawFilters["area"])
        if let location, let area = SearchQueryParser.area(slug: location) {
            out.areas = [area]
        }
        return out
    }

    /// `rawFilters` with only the alert flag changed. Every other key,
    /// including ones this binary does not know, is sent back untouched.
    func mergedFilters(alertsEnabled enabled: Bool) -> [String: SavedSearchJSON] {
        var merged = rawFilters
        merged["alerts_enabled"] = .bool(enabled)
        return merged
    }

    /// Values the web treats as unset (savedSearchMatch.ts UNSET_VALUES).
    private static let unsetValues: Set<String> = ["", "all", "any-location", "any-price", "any"]

    private static func setString(_ value: SavedSearchJSON?) -> String? {
        guard case .string(let s)? = value else { return nil }
        let trimmed = s.trimmingCharacters(in: .whitespacesAndNewlines)
        return unsetValues.contains(trimmed.lowercased()) ? nil : trimmed
    }
}

/// The saved query payload stored in `saved_searches.filters` (JSONB).
///
/// `query`/`tab`/`alerts_enabled` are what iOS always wrote. The web's keys
/// (`q`, `preset`, `price`, `category`, `location`) are written too since
/// IOS-DD-SEARCH-09, so the alert job and the web read an iOS search the way
/// they read their own. They are additive and optional.
struct SavedSearchFilters: Codable, Hashable {
    var query: String
    var tab: String?
    var alertsEnabled: Bool
    var q: String?
    var preset: String?
    var price: String?
    var category: String?
    var location: String?

    init(
        query: String,
        tab: String? = nil,
        alertsEnabled: Bool = false,
        q: String? = nil,
        preset: String? = nil,
        price: String? = nil,
        category: String? = nil,
        location: String? = nil
    ) {
        self.query = query
        self.tab = tab
        self.alertsEnabled = alertsEnabled
        self.q = q
        self.preset = preset
        self.price = price
        self.category = category
        self.location = location
    }

    enum CodingKeys: String, CodingKey {
        case query, tab, q, preset, price, category, location
        case alertsEnabled = "alerts_enabled"
    }

    /// Tolerant decode — older/foreign rows may omit fields.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        query = (try? c.decode(String.self, forKey: .query)) ?? ""
        tab = try? c.decodeIfPresent(String.self, forKey: .tab)
        alertsEnabled = (try? c.decode(Bool.self, forKey: .alertsEnabled)) ?? false
        q = try? c.decodeIfPresent(String.self, forKey: .q)
        preset = try? c.decodeIfPresent(String.self, forKey: .preset)
        price = try? c.decodeIfPresent(String.self, forKey: .price)
        category = try? c.decodeIfPresent(String.self, forKey: .category)
        location = try? c.decodeIfPresent(String.self, forKey: .location)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(query, forKey: .query)
        try c.encodeIfPresent(tab, forKey: .tab)
        try c.encode(alertsEnabled, forKey: .alertsEnabled)
        try c.encodeIfPresent(q, forKey: .q)
        try c.encodeIfPresent(preset, forKey: .preset)
        try c.encodeIfPresent(price, forKey: .price)
        try c.encodeIfPresent(category, forKey: .category)
        try c.encodeIfPresent(location, forKey: .location)
    }

    /// The filters for a new save: the typed words under `query` (as iOS
    /// always wrote them) and the parsed keywords and filters under the web's
    /// keys.
    static func forSave(query: String, tab: String?, parsed: ParsedSearch) -> SavedSearchFilters {
        let f = parsed.filters
        return SavedSearchFilters(
            query: query,
            tab: tab,
            alertsEnabled: false,
            q: parsed.keywords.isEmpty ? nil : parsed.keywords,
            preset: f.datePreset.flatMap { SearchQueryParser.presetSlug[$0] },
            price: f.freeOnly ? "free" : nil,
            category: f.category?.rawValue,
            location: f.areas.first.flatMap { SearchQueryParser.areaSlugs[$0] }
        )
    }
}

/// A JSON value, so `saved_searches.filters` can be read and written back
/// without knowing every key in it. Kept here rather than using supabase's
/// AnyJSON so the model and its tests do not depend on the SDK.
enum SavedSearchJSON: Codable, Hashable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case array([SavedSearchJSON])
    case object([String: SavedSearchJSON])
    case null

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() {
            self = .null
        } else if let b = try? c.decode(Bool.self) {
            self = .bool(b)
        } else if let n = try? c.decode(Double.self) {
            self = .number(n)
        } else if let s = try? c.decode(String.self) {
            self = .string(s)
        } else if let a = try? c.decode([SavedSearchJSON].self) {
            self = .array(a)
        } else {
            self = .object(try c.decode([String: SavedSearchJSON].self))
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let s): try c.encode(s)
        case .number(let n): try c.encode(n)
        case .bool(let b): try c.encode(b)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        case .null: try c.encodeNil()
        }
    }
}
