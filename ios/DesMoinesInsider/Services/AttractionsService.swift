import Foundation
import CoreLocation
import Supabase

/// Fetches attractions from Supabase, matching the web app's useAttractions hook.
actor AttractionsService {
    static let shared = AttractionsService()

    private let supabase: SupabaseClient? = SupabaseService.shared.client

    enum ServiceError: LocalizedError {
        case notConfigured
        var errorDescription: String? { "Supabase is not configured." }
    }

    private func db() throws -> SupabaseClient {
        guard let supabase else { throw ServiceError.notConfigured }
        return supabase
    }

    /// Server-side ordering for a paged attractions query (IOS-AUDIT-BUG-006 AC1).
    ///
    /// Sorting used to happen in the view model, over only the pages fetched so
    /// far, so "Top rated" ranked the loaded subset rather than the collection -
    /// the best-rated attraction on page 3 stayed below page 1 until page 3
    /// happened to load.
    enum Sort {
        /// Featured first, then rating, then name (IOS-DD-BROWSE-16). The
        /// default: newest-first was the least useful order for a couple of
        /// dozen curated places. Ordered by several keys, so `_fetchAttractions`
        /// builds it as its own branch; `column`/`ascending` give its first key.
        case featured
        case newest
        case rating
        case name

        var column: String {
            switch self {
            case .featured: return "is_featured"
            case .newest: return "created_at"
            case .rating: return "rating"
            case .name: return "name"
            }
        }

        var ascending: Bool {
            switch self {
            case .featured, .newest, .rating: return false
            case .name: return true
            }
        }
    }

    struct AttractionsQuery {
        var searchText: String?
        /// Single-type filter. Ignored when `types` is set.
        var type: String?
        /// Multi-type filter, applied server-side with an IN clause
        /// (IOS-AUDIT-BUG-006 AC2). The view model used to fetch a broad page and
        /// drop non-matching rows in Swift, which could shrink a page to almost
        /// nothing - and because loadMore only fires within 5 items of the end of
        /// the DISPLAY list, a page filtered down to two rows left the user unable
        /// to scroll far enough to request the next one.
        var types: [String]?
        var minRating: Double?
        var isFeatured: Bool?
        /// Only rows the table marks true; null (unknown) never matches
        /// (IOS-DD-BROWSE-16).
        var isFree: Bool?
        var isKidFriendly: Bool?
        /// "Rainy day": indoor places.
        var isIndoor: Bool?
        /// A neighborhood or city (IOS-DD-BROWSE-17), matched server-side by
        /// `attractionAreaFilter`.
        var area: LocationArea?
        var sortBy: Sort = .featured
        var limit: Int = Config.defaultPageSize
        var offset: Int = 0
    }

    struct AttractionsResponse {
        let attractions: [Attraction]
        let totalCount: Int
        let hasMore: Bool
    }

    func fetchAttractions(query: AttractionsQuery = AttractionsQuery()) async throws -> AttractionsResponse {
        try await withRetry { [self] in try await _fetchAttractions(query: query) }
    }

    /// The `or=` value for a text search over name, type, location and
    /// description, or nil when there is nothing to search for. Trimmed and
    /// capped at 100 characters; each branch goes through
    /// `EventsService.ilikeContains` (IOS-DD-SEARCH-01).
    ///
    /// It used to interpolate the raw text: "Blank Park Zoo, Des Moines" split
    /// the clause at the comma and PostgREST answered 400, which Search showed
    /// as no attractions; "_" matched every row; "x%,rating.gte.0" added a
    /// branch of its own.
    static func searchOrFilter(_ raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let pattern = EventsService.ilikeContains(String(trimmed.prefix(100)))
        return ["name", "type", "location", "description"]
            .map { "\($0).ilike.\(pattern)" }
            .joined(separator: ",")
    }

    /// The boolean column filters a query applies, in a fixed order. Only a
    /// `true` is sent: "free: no" is not a filter anyone asked for, and a
    /// null column must not be read as false.
    static func booleanFilters(_ q: AttractionsQuery) -> [(String, Bool)] {
        var out: [(String, Bool)] = []
        if q.isFree == true { out.append(("is_free", true)) }
        if q.isKidFriendly == true { out.append(("is_kid_friendly", true)) }
        if q.isIndoor == true { out.append(("is_indoor", true)) }
        return out
    }

    /// One or-group matching an area (IOS-DD-BROWSE-17).
    ///
    /// The attractions table has no `city` column, so `LocationArea.filterClause`
    /// (which leads with `city.ilike`) would answer 400 here. A district uses
    /// the same bounding box as events. A city matches `location` or
    /// `address` ending in ", City", or carrying ", City, IA" / ", City, Iowa":
    /// anchored on the comma, so "3500 Urbandale Ave, Des Moines" is not
    /// Urbandale and ", West Des Moines" is not Des Moines.
    static func attractionAreaFilter(_ area: LocationArea) -> String {
        if area.bbox != nil { return area.filterClause }
        let city = area.rawValue
        let patterns = ["%, \(city)", "%, \(city), IA%", "%, \(city), Iowa%"]
        return ["location", "address"]
            .flatMap { column in patterns.map { "\(column).ilike.\(EventsService.postgrestQuoted($0))" } }
            .joined(separator: ",")
    }

    private func _fetchAttractions(query: AttractionsQuery) async throws -> AttractionsResponse {
        let client = try db()
        // is_active is the admin soft-delete (20260520000004); the web list
        // filters it too (useAttractions.ts). IOS-DD-SEARCH-01.
        var request = client
            .from("attractions")
            .select("*", head: false, count: .exact)
            .eq("is_active", value: true)

        // Search (multi-field ILIKE). The text is quoted and LIKE-escaped, so a
        // comma, paren, '%' or '_' in it is matched literally rather than
        // ending the or= clause or matching everything (IOS-DD-SEARCH-01).
        // The area is a second or-group; both go out as ONE `or=` param.
        var orGroups: [String] = []
        if let search = query.searchText, let filter = Self.searchOrFilter(search) {
            orGroups.append(filter)
        }
        if let area = query.area {
            orGroups.append(Self.attractionAreaFilter(area))
        }
        if let combined = EventsService.combineOrGroups(orGroups) {
            request = request.or(combined)
        }

        // Type filter. `types` wins when both are supplied.
        if let types = query.types, !types.isEmpty {
            request = request.in("type", values: types)
        } else if let type = query.type, !type.isEmpty {
            request = request.eq("type", value: type)
        }

        // Rating filter
        if let minRating = query.minRating {
            request = request.gte("rating", value: minRating)
        }

        // Featured
        if query.isFeatured == true {
            request = request.eq("is_featured", value: true)
        }

        for (column, value) in Self.booleanFilters(query) {
            request = request.eq(column, value: value)
        }

        // Order and pagination (transforms must come after all filters)
        // Ordering is server-side so an offset window means the same thing on
        // every page. A secondary key on id keeps the order total: rows sharing a
        // rating (or a null one) would otherwise be free to swap between pages and
        // appear twice or not at all. One fully typed chain per branch, as in
        // EventsService, since the transform builder has no stable type name.
        let data: Data
        let count: Int?
        switch query.sortBy {
        case .featured:
            let r = try await request
                .order("is_featured", ascending: false, nullsFirst: false)
                .order("rating", ascending: false, nullsFirst: false)
                .order("name", ascending: true)
                .order("id", ascending: true)
                .range(from: query.offset, to: query.offset + query.limit - 1)
                .execute()
            data = r.data; count = r.count
        case .newest, .rating, .name:
            let r = try await request
                .order(query.sortBy.column, ascending: query.sortBy.ascending, nullsFirst: false)
                .order("id", ascending: true)
                .range(from: query.offset, to: query.offset + query.limit - 1)
                .execute()
            data = r.data; count = r.count
        }
        let attractions = try JSONDecoder().decode([Attraction].self, from: data)
        let total = count ?? attractions.count

        return AttractionsResponse(
            attractions: attractions,
            totalCount: total,
            hasMore: query.offset + query.limit < total
        )
    }

    // MARK: - Nearby Attractions

    /// Attractions within the default search radius, nearest first.
    ///
    /// IOS-AUDIT-PERF-027. This used to take the first `limit` rows in whatever
    /// order Postgres returned them -- no ORDER BY at all -- and then filter by
    /// distance in Swift. Anything in radius past the cutoff was invisible, and
    /// which rows survived was arbitrary.
    ///
    /// It has not misbehaved yet only because the table is small: 22 attractions,
    /// 17 geocoded, against a limit of 50, so the client-side filter has been
    /// seeing everything. The 23rd row past the limit is when it starts lying.
    ///
    /// `radiusMiles` lets the map's "Search this area" ask for the visible
    /// region (IOS-DD-MAP-05); the RPC clamps it to 50.
    func fetchNearbyAttractions(latitude: Double, longitude: Double, radiusMiles: Double = Config.defaultSearchRadiusMiles, limit: Int = 50) async throws -> [Attraction] {
        let client = try db()

        struct RadiusParams: Encodable {
            let center_lat: Double
            let center_lng: Double
            let radius_miles: Double
            let limit_count: Int
        }

        // The RPC returns SETOF attractions, so it decodes into the same model as
        // the table query below and orders by distance server-side.
        if let nearby: [Attraction] = try? await client
            .rpc("attractions_within_radius", params: RadiusParams(
                center_lat: latitude,
                center_lng: longitude,
                radius_miles: radiusMiles,
                limit_count: limit
            ))
            .execute()
            .value {
            return nearby
        }

        // Fallback for a project where the RPC is not deployed. The bounding box
        // is applied BEFORE the limit so the cutoff falls on rows that are
        // already near, rather than on the whole table (AC1).
        let box = GeoBoundingBox(centerLat: latitude, centerLng: longitude, radiusMiles: radiusMiles)
        let attractions: [Attraction] = try await client
            .from("attractions")
            .select()
            .eq("is_active", value: true)
            .gte("latitude", value: box.minLat)
            .lte("latitude", value: box.maxLat)
            .gte("longitude", value: box.minLng)
            .lte("longitude", value: box.maxLng)
            .limit(limit)
            .execute()
            .value

        // The box is a square around a circle, so its corners still need the
        // exact distance check -- but now over rows that are all roughly in range.
        let center = CLLocation(latitude: latitude, longitude: longitude)
        let radiusMeters = radiusMiles * 1609.34
        return attractions
            .compactMap { attraction -> (Attraction, Double)? in
                guard let coord = attraction.coordinate else { return nil }
                let loc = CLLocation(latitude: coord.latitude, longitude: coord.longitude)
                let distance = center.distance(from: loc)
                return distance <= radiusMeters ? (attraction, distance) : nil
            }
            .sorted { $0.1 < $1.1 }
            .map(\.0)
    }

    /// One active attraction by id or slug (IOS-DD-BROWSE-12). A universal
    /// link carries the web's slug; a soft-deleted (`is_active = false`) or
    /// unknown row answers PGRST116, which the callers show as unavailable
    /// instead of opening a place the admin has taken down.
    func fetchAttraction(id: String) async throws -> Attraction {
        try await withRetry { [self] in
            let client = try db()
            let column = UUID(uuidString: id) == nil ? "slug" : "id"
            let attraction: Attraction = try await client
                .from("attractions")
                .select()
                .eq(column, value: id)
                .eq("is_active", value: true)
                .single()
                .execute()
                .value
            return attraction
        }
    }

    // MARK: - Fetch by Types (IOS-PARITY-006 content hubs)

    /// Attractions whose `type` is one of the given raw values (e.g. Outdoors =
    /// Park/Garden/Zoo), featured first. Used by the curated content hubs.
    func fetchAttractions(types: [String], limit: Int = 20) async throws -> [Attraction] {
        guard !types.isEmpty else { return [] }
        return try await withRetry { [self] in
            let client = try db()
            let attractions: [Attraction] = try await client
                .from("attractions")
                .select()
                .eq("is_active", value: true)
                .in("type", values: types)
                .order("is_featured", ascending: false)
                .order("rating", ascending: false, nullsFirst: false)
                .limit(limit)
                .execute()
                .value
            return attractions
        }
    }
}

/// What SearchViewModel needs from AttractionsService (IOS-AUDIT-TEST-006).
///
/// One method. There is no fuzzy fallback for attractions: an attractions search
/// that returns nothing returns nothing, while events and restaurants get a
/// second, looser attempt. The search text is escaped by `searchOrFilter` and
/// soft-deleted (`is_active = false`) rows are excluded (IOS-DD-SEARCH-01).
protocol AttractionSearchProviding: Sendable {
    func fetchAttractions(query: AttractionsService.AttractionsQuery) async throws -> AttractionsService.AttractionsResponse
}

extension AttractionsService: AttractionSearchProviding {}
