import Foundation
import CoreLocation
import Supabase

/// Fetches restaurants from Supabase, matching the web app's useRestaurants hook.
actor RestaurantsService {
    static let shared = RestaurantsService()

    private let supabase: SupabaseClient? = SupabaseService.shared.client

    enum ServiceError: LocalizedError {
        case notConfigured
        var errorDescription: String? { "Supabase is not configured." }
    }

    private func db() throws -> SupabaseClient {
        guard let supabase else { throw ServiceError.notConfigured }
        return supabase
    }

    // MARK: - Query Parameters

    struct RestaurantsQuery {
        var searchText: String?
        var cuisines: [String]?
        var priceRanges: [String]?
        var locations: [String]?
        var minRating: Double?
        var isFeatured: Bool?
        var sortBy: RestaurantSortOption = .popularity
        var limit: Int = Config.defaultPageSize
        var offset: Int = 0
        /// One seed for every page of a list, so page 2 comes from the same
        /// shuffle as page 1 (IOS-DD-RESTAURANTS-02). Nil means today's.
        var rotationSeed: Int?
        /// Keys of `dietaryKeywords`, matched server-side (IOS-DD-RESTAURANTS-04).
        var dietary: [String]?
        /// Lifecycle `status` values, e.g. the "New & coming soon" preset
        /// (IOS-DD-RESTAURANTS-07). Forces the table path.
        var statuses: [String]?
    }

    struct RestaurantsResponse {
        let restaurants: [Restaurant]
        let totalCount: Int
        let hasMore: Bool
    }

    // MARK: - Fetch Restaurants

    func fetchRestaurants(query: RestaurantsQuery = RestaurantsQuery()) async throws -> RestaurantsResponse {
        try await withRetry { [self] in try await _fetchRestaurants(query: query) }
    }

    private func _fetchRestaurants(query: RestaurantsQuery) async throws -> RestaurantsResponse {
        // Default popularity sort goes through the rotation RPC so the same
        // ~20 restaurants don't appear at the top every visit. Other sorts
        // were picked explicitly by the user, keep them deterministic.
        //
        // Only a missing function falls through to the table query
        // (IOS-DD-RESTAURANTS-03). `try?` used to swallow every error, so a
        // timeout was answered by a second, differently ordered query.
        if Self.usesRotationRPC(query) {
            do {
                return try await _fetchRestaurantsRotated(query: query)
            } catch let error where Self.isMissingFunctionError(error) {
                // The migration has not deployed: fall through.
            }
        }

        let client = try db()
        // Hide rows merged into a duplicate (WEB-AUTO-005), as the web does.
        var request = client
            .from("restaurants")
            .select("*", head: false, count: .exact)
            .neq("is_merged", value: true)

        // Prefix full-text search, so "harb" finds Harbinger; quotes or OR go
        // to websearch (IOS-DD-RESTAURANTS-03).
        if let search = query.searchText, let ts = Self.prefixTsQuery(search) {
            request = request.textSearch("search_vector", query: ts.query, config: "english", type: ts.websearch ? .websearch : nil)
        }

        // Cuisine filter
        if let cuisines = query.cuisines, !cuisines.isEmpty {
            request = request.in("cuisine", values: cuisines)
        }

        // Price range filter
        if let priceRanges = query.priceRanges, !priceRanges.isEmpty {
            request = request.in("price_range", values: priceRanges)
        }

        // Location filter: values that are not a LocationArea (a stored
        // address from an older build) keep the exact match. Areas are an
        // or-group below (IOS-DD-RESTAURANTS-05).
        let legacyLocations = Self.splitLocations(query.locations).legacy
        if !legacyLocations.isEmpty {
            request = request.in("location", values: legacyLocations)
        }

        // Rating filter
        if let minRating = query.minRating {
            request = request.gte("rating", value: minRating)
        }

        // Featured only
        if query.isFeatured == true {
            request = request.eq("is_featured", value: true)
        }

        // Lifecycle statuses
        if let statuses = query.statuses, !statuses.isEmpty {
            request = request.in("status", values: statuses)
        }

        // Dietary and area or-groups, nested into ONE `or=` param.
        if let combined = EventsService.combineOrGroups(Self.orGroups(for: query)) {
            request = request.or(combined)
        }

        // Sorting + Pagination + Execute
        let offset = query.offset
        let limit = query.limit
        let data: Data
        let count: Int?

        if let statuses = query.statuses, !statuses.isEmpty, query.sortBy == .popularity {
            // Openings under the default sort: latest opening_date first,
            // nulls last (NewRestaurants.tsx). A sort the user picked from
            // the menu still applies below.
            let r = try await request
                .order("opening_date", ascending: false)
                .order("created_at", ascending: false)
                .order("id", ascending: true)
                .range(from: offset, to: offset + limit - 1)
                .execute()
            data = r.data; count = r.count
        } else {
            switch query.sortBy {
            case .popularity:
                let r = try await request
                    .order("popularity_score", ascending: false)
                    .order("is_featured", ascending: false)
                    .order("created_at", ascending: false)
                    .range(from: offset, to: offset + limit - 1)
                    .execute()
                data = r.data; count = r.count
            case .rating:
                let r = try await request
                    .order("rating", ascending: false)
                    .order("popularity_score", ascending: false)
                    .range(from: offset, to: offset + limit - 1)
                    .execute()
                data = r.data; count = r.count
            case .newest:
                let r = try await request
                    .order("created_at", ascending: false)
                    .range(from: offset, to: offset + limit - 1)
                    .execute()
                data = r.data; count = r.count
            case .alphabetical:
                let r = try await request
                    .order("name", ascending: true)
                    .range(from: offset, to: offset + limit - 1)
                    .execute()
                data = r.data; count = r.count
            case .priceLow:
                let r = try await request
                    .order("price_range", ascending: true)
                    .order("popularity_score", ascending: false)
                    .range(from: offset, to: offset + limit - 1)
                    .execute()
                data = r.data; count = r.count
            case .priceHigh:
                let r = try await request
                    .order("price_range", ascending: false)
                    .order("popularity_score", ascending: false)
                    .range(from: offset, to: offset + limit - 1)
                    .execute()
                data = r.data; count = r.count
            }
        }

        var restaurants = try JSONDecoder().decode([Restaurant].self, from: data)
        if query.sortBy == .popularity && (query.statuses ?? []).isEmpty {
            restaurants = Self.deprioritizeUnvisitable(restaurants)
        }
        let total = count ?? restaurants.count

        return RestaurantsResponse(
            restaurants: restaurants,
            totalCount: total,
            hasMore: query.offset + query.limit < total
        )
    }

    // MARK: - Query building (IOS-DD-RESTAURANTS-03 / 04 / 05)

    /// The rotation RPC models none of search-as-prefix, dietary, areas or
    /// lifecycle statuses, so any of them takes the table path (the web's
    /// useRotationRpc rule).
    static func usesRotationRPC(_ q: RestaurantsQuery) -> Bool {
        q.sortBy == .popularity
            && (q.searchText?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
            && (q.dietary ?? []).isEmpty
            && splitLocations(q.locations).areas.isEmpty
            && (q.statuses ?? []).isEmpty
    }

    /// Known areas and everything else. A LocationArea value means the
    /// web's area match; anything else is a legacy exact `location`.
    static func splitLocations(_ locations: [String]?) -> (areas: [LocationArea], legacy: [String]) {
        var areas: [LocationArea] = []
        var legacy: [String] = []
        for value in locations ?? [] {
            if let area = LocationArea(rawValue: value) { areas.append(area) } else { legacy.append(value) }
        }
        return (areas, legacy)
    }

    /// The or-groups the table path sends: dietary, then areas.
    static func orGroups(for q: RestaurantsQuery) -> [String] {
        var groups: [String] = []
        if let dietary = dietaryOrGroup(q.dietary ?? []) { groups.append(dietary) }
        let areas = splitLocations(q.locations).areas
        if !areas.isEmpty { groups.append(areas.map(\.filterClause).joined(separator: ",")) }
        return groups
    }

    /// DIETARY_KEYWORDS in src/hooks/useRestaurants.ts. There is no dietary
    /// column, so a diet is a text match on name, description and cuisine.
    static let dietaryKeywords: [String: [String]] = [
        "vegan": ["vegan"],
        "vegetarian": ["vegetarian", "veggie"],
        "gluten-free": ["gluten free", "gluten-free", "celiac"],
        "keto": ["keto", "low carb"],
        "halal": ["halal"],
    ]

    /// One or-group for the selected diets, or nil. Unknown keys are dropped,
    /// as resolveDietarySelections does, so a stray value can never become a
    /// three-column ILIKE.
    static func dietaryOrGroup(_ diets: [String]) -> String? {
        let clauses = diets.sorted().flatMap { diet -> [String] in
            (dietaryKeywords[diet] ?? []).map { kw in
                let p = EventsService.ilikeContains(kw)
                return "description.ilike.\(p),cuisine.ilike.\(p),name.ilike.\(p)"
            }
        }
        return clauses.isEmpty ? nil : clauses.joined(separator: ",")
    }

    /// hubSearchQuery (src/components/events/eventsHubQuery.ts): every word
    /// must match and the last is a prefix. Quotes or a standalone OR go to
    /// websearch, which understands them.
    static func prefixTsQuery(_ input: String) -> (query: String, websearch: Bool)? {
        let raw = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { return nil }
        let words = raw.split(whereSeparator: { $0.isWhitespace })
        if raw.contains("\"") || words.contains("OR") { return (raw, true) }
        let meta: Set<Character> = ["&", "|", "!", "(", ")", ":", "*", "<", ">", "'", "\"", "\\"]
        let cleaned = String(raw.map { meta.contains($0) ? " " : $0 })
        let tokens = cleaned.split(whereSeparator: { $0.isWhitespace }).map(String.init)
        guard !tokens.isEmpty else { return (raw, true) }
        let last = tokens.count - 1
        let query = tokens.enumerated().map { $0.offset == last ? "\($0.element):*" : $0.element }.joined(separator: " & ")
        return (query, false)
    }

    /// PostgREST's "no such function" (PGRST202) and Postgres's (42883): the
    /// only RPC errors the table query may answer. Read structurally, like
    /// EventDetailViewModel.isNotFound, so a test can throw its own error
    /// with a `code`.
    static func isMissingFunctionError(_ error: Error) -> Bool {
        let code: String?
        if let postgrest = error as? PostgrestError {
            code = postgrest.code
        } else {
            code = Mirror(reflecting: error).children.first { $0.label == "code" }?.value as? String
        }
        return code == "PGRST202" || code == "42883"
    }

    /// Not-yet-open and closed venues sink below the ones you can visit,
    /// order kept within each band (deprioritizeUnvisitable on the web, which
    /// 20260930000001 would do server-side but has not been applied).
    static func deprioritizeUnvisitable(_ rows: [Restaurant]) -> [Restaurant] {
        var visitable: [Restaurant] = []
        var upcoming: [Restaurant] = []
        var closed: [Restaurant] = []
        for row in rows {
            switch row.lifecycle {
            case .open, .newlyOpened: visitable.append(row)
            case .openingSoon: upcoming.append(row)
            case .closedPermanently, .closedTemporarily: closed.append(row)
            }
        }
        return visitable + upcoming + closed
    }

    // MARK: - Rotated Popularity Listing

    /// Per-day rotation seed: days since 1970 of the Des Moines calendar
    /// date, getRestaurantRotationSeed on the web. It used to be the UTC day,
    /// which turns over at 7pm Central, so page 2 at dinner time came from a
    /// different shuffle than page 1 (IOS-DD-RESTAURANTS-03).
    static func rotationSeed(now: Date) -> Int {
        let parts = DesMoinesTime.calendar.dateComponents([.year, .month, .day], from: now)
        var utc = Calendar(identifier: .gregorian)
        // swiftlint:disable:next force_unwrapping
        utc.timeZone = TimeZone(identifier: "UTC")!
        guard let midnight = utc.date(from: DateComponents(year: parts.year, month: parts.month, day: parts.day)) else {
            return Int(now.timeIntervalSince1970 / 86_400)
        }
        return Int((midnight.timeIntervalSince1970 / 86_400).rounded(.down))
    }

    private struct RotatedRestaurantsParams: Encodable {
        let rotation_seed: Int
        let search_query: String?
        let cuisine_filter: [String]?
        let price_filter: [String]?
        let location_filter: [String]?
        let min_rating: Double?
        let max_rating: Double?
        let featured_only: Bool
        let limit_count: Int
        let offset_count: Int
    }

    private struct RotatedRestaurantRow: Decodable {
        let restaurant_data: Restaurant
        let total_count: Int64
    }

    private func _fetchRestaurantsRotated(query: RestaurantsQuery) async throws -> RestaurantsResponse {
        let client = try db()
        let legacyLocations = Self.splitLocations(query.locations).legacy
        let params = RotatedRestaurantsParams(
            rotation_seed: query.rotationSeed ?? Self.rotationSeed(now: .now),
            search_query: (query.searchText?.isEmpty ?? true) ? nil : query.searchText,
            cuisine_filter: (query.cuisines?.isEmpty ?? true) ? nil : query.cuisines,
            price_filter: (query.priceRanges?.isEmpty ?? true) ? nil : query.priceRanges,
            // Areas never reach here (usesRotationRPC); only legacy values.
            location_filter: legacyLocations.isEmpty ? nil : legacyLocations,
            min_rating: query.minRating,
            max_rating: nil,
            featured_only: query.isFeatured == true,
            limit_count: query.limit,
            offset_count: query.offset
        )

        let rows: [RotatedRestaurantRow] = try await client
            .rpc("get_rotated_restaurants", params: params)
            .execute()
            .value

        let restaurants = Self.deprioritizeUnvisitable(rows.map(\.restaurant_data))
        let total = Int(rows.first?.total_count ?? Int64(restaurants.count))

        return RestaurantsResponse(
            restaurants: restaurants,
            totalCount: total,
            hasMore: query.offset + query.limit < total
        )
    }

    // MARK: - Single Restaurant

    /// By id, or by slug for a web link such as /restaurants/zombie-burger
    /// (IOS-DD-RESTAURANTS-09). A slug sent to the uuid column is a 22P02.
    func fetchRestaurant(id: String) async throws -> Restaurant {
        let client = try db()
        let column = UUID(uuidString: id) == nil ? "slug" : "id"
        let restaurant: Restaurant = try await client
            .from("restaurants")
            .select()
            .eq(column, value: id)
            .single()
            .execute()
            .value
        return restaurant
    }

    // MARK: - Nearby Restaurants

    func fetchNearbyRestaurants(latitude: Double, longitude: Double, radiusMiles: Double = 25, limit: Int = 100) async throws -> [Restaurant] {
        // Try PostGIS RPC first for optimal performance
        if let rpcResults = try? await fetchNearbyRestaurantsViaRPC(latitude: latitude, longitude: longitude, radiusMiles: radiusMiles, limit: limit),
           !rpcResults.isEmpty {
            return rpcResults
        }
        // Fallback: direct table query with client-side distance filtering
        return try await fetchNearbyRestaurantsViaTable(latitude: latitude, longitude: longitude, radiusMiles: radiusMiles, limit: limit)
    }

    private func fetchNearbyRestaurantsViaRPC(latitude: Double, longitude: Double, radiusMiles: Double, limit: Int) async throws -> [Restaurant] {
        struct NearbyParams: Encodable {
            let center_lat: Double
            let center_lng: Double
            let radius_miles: Double
            let limit_count: Int
        }

        let client = try db()
        let restaurants: [Restaurant] = try await client
            .rpc("restaurants_within_radius", params: NearbyParams(
                center_lat: latitude,
                center_lng: longitude,
                radius_miles: radiusMiles,
                limit_count: limit
            ))
            .execute()
            .value
        return restaurants
    }

    private func fetchNearbyRestaurantsViaTable(latitude: Double, longitude: Double, radiusMiles: Double, limit: Int) async throws -> [Restaurant] {
        let client = try db()
        let restaurants: [Restaurant] = try await client
            .from("restaurants")
            .select()
            .not("latitude", operator: .is, value: "null")
            .not("longitude", operator: .is, value: "null")
            .limit(limit)
            .execute()
            .value

        let center = CLLocation(latitude: latitude, longitude: longitude)
        let radiusMeters = radiusMiles * 1609.34
        return restaurants.filter { restaurant in
            guard let coord = restaurant.coordinate else { return false }
            let loc = CLLocation(latitude: coord.latitude, longitude: coord.longitude)
            return center.distance(from: loc) <= radiusMeters
        }
    }

    // MARK: - Fuzzy Search Fallback

    func fuzzySearchRestaurants(query: String, limit: Int = 20) async throws -> [Restaurant] {
        struct FuzzyParams: Encodable {
            let search_query: String
            let search_limit: Int
        }

        let client = try db()
        let restaurants: [Restaurant] = try await client
            .rpc("fuzzy_search_restaurants", params: FuzzyParams(search_query: query, search_limit: limit))
            .execute()
            .value
        return restaurants
    }

    // MARK: - Cuisine List

    /// Distinct cuisines for the filter chips.
    ///
    /// Server-side since IOS-AUDIT-PERF-025. This used to select the cuisine
    /// column with no limit and de-duplicate into a Swift Set, so opening the
    /// filter sheet downloaded one row per restaurant to end up with about
    /// seventy strings. The cost was proportional to the table; the result
    /// never was.
    func fetchAvailableCuisines() async throws -> [String] {
        try await FilterValues.fetch(source: .restaurantCuisine, client: db())
    }

    // MARK: - Location / Area List

    /// Distinct locations for the filter chips.
    ///
    /// Server-side since IOS-AUDIT-PERF-025, and this one saves the least,
    /// because `location` holds a full street address rather than an area:
    /// 456 distinct values across 478 restaurants, measured on production.
    /// RestaurantInlineFilters renders `availableLocations.prefix(40)`, so the
    /// Location filter is the first forty street addresses in alphabetical
    /// order - a chip reading "100 Plymouth St W, Le Mars, IA 51031, USA".
    ///
    /// Making that list cheaper to fetch does not make it useful. The fix is a
    /// city filter, and it is a bigger change than this story: the chip value
    /// is matched with `.in("location", ...)` here and passed as
    /// `location_filter` to search_restaurants, so switching to cities means
    /// changing a predicate and the meaning of an RPC parameter that shipped
    /// binaries already send. Filed rather than smuggled in.
    ///
    /// The Dining tab no longer calls this: its Area pill lists LocationArea
    /// and the service turns those values into the web's area clauses, while
    /// any other value keeps the exact match (IOS-DD-RESTAURANTS-05). Kept for
    /// compatibility.
    func fetchAvailableLocations() async throws -> [String] {
        try await FilterValues.fetch(source: .restaurantLocation, client: db())
    }
}

/// What SearchViewModel needs from RestaurantsService (IOS-AUDIT-TEST-006).
/// One page of restaurants for a query. All DiscoverViewModel needs.
protocol RestaurantPageProviding: Sendable {
    func fetchRestaurants(query: RestaurantsService.RestaurantsQuery) async throws -> RestaurantsService.RestaurantsResponse
}

/// Search additionally needs the fuzzy fallback.
protocol RestaurantSearchProviding: RestaurantPageProviding {
    func fuzzySearchRestaurants(query: String, limit: Int) async throws -> [Restaurant]
}

extension RestaurantSearchProviding {
    func fuzzySearchRestaurants(query: String) async throws -> [Restaurant] {
        try await fuzzySearchRestaurants(query: query, limit: 20)
    }
}

extension RestaurantsService: RestaurantSearchProviding {}

/// What the Dining tab's RestaurantsViewModel needs (IOS-DD-RESTAURANTS-02).
/// Inherits the search role rather than widening it, so the Search fake
/// stays as it is.
protocol RestaurantFeedProviding: RestaurantSearchProviding {
    func fetchAvailableCuisines() async throws -> [String]
}

extension RestaurantsService: RestaurantFeedProviding {}

/// What RestaurantDetailViewModel needs (IOS-DD-RESTAURANTS-09).
protocol RestaurantDetailProviding: Sendable {
    func fetchRestaurant(id: String) async throws -> Restaurant
}

extension RestaurantsService: RestaurantDetailProviding {}
