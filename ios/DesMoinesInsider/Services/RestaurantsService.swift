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
        if query.sortBy == .popularity {
            if let rotated = try? await _fetchRestaurantsRotated(query: query) {
                return rotated
            }
            // Fall through to the legacy table query if the RPC isn't
            // available (e.g. the migration hasn't deployed yet).
        }

        let client = try db()
        var request = client
            .from("restaurants")
            .select("*", head: false, count: .exact)

        // Full-text search
        if let search = query.searchText, !search.isEmpty {
            request = request.textSearch("search_vector", query: search, config: "english", type: .websearch)
        }

        // Cuisine filter
        if let cuisines = query.cuisines, !cuisines.isEmpty {
            request = request.in("cuisine", values: cuisines)
        }

        // Price range filter
        if let priceRanges = query.priceRanges, !priceRanges.isEmpty {
            request = request.in("price_range", values: priceRanges)
        }

        // Location filter
        if let locations = query.locations, !locations.isEmpty {
            request = request.in("location", values: locations)
        }

        // Rating filter
        if let minRating = query.minRating {
            request = request.gte("rating", value: minRating)
        }

        // Featured only
        if query.isFeatured == true {
            request = request.eq("is_featured", value: true)
        }

        // Sorting + Pagination + Execute
        let offset = query.offset
        let limit = query.limit
        let data: Data
        let count: Int?

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

        let restaurants = try JSONDecoder().decode([Restaurant].self, from: data)
        let total = count ?? restaurants.count

        return RestaurantsResponse(
            restaurants: restaurants,
            totalCount: total,
            hasMore: query.offset + query.limit < total
        )
    }

    // MARK: - Rotated Popularity Listing

    /// Per-day rotation seed. Stable for the day so pagination doesn't
    /// reshuffle between pages, but changes daily so users don't see the
    /// same first 20 restaurants every visit.
    private static func dailyRotationSeed(now: Date = .now) -> Int {
        Int(now.timeIntervalSince1970 / 86_400)
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
        let params = RotatedRestaurantsParams(
            rotation_seed: Self.dailyRotationSeed(),
            search_query: (query.searchText?.isEmpty ?? true) ? nil : query.searchText,
            cuisine_filter: (query.cuisines?.isEmpty ?? true) ? nil : query.cuisines,
            price_filter: (query.priceRanges?.isEmpty ?? true) ? nil : query.priceRanges,
            location_filter: (query.locations?.isEmpty ?? true) ? nil : query.locations,
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

        let restaurants = rows.map(\.restaurant_data)
        let total = Int(rows.first?.total_count ?? Int64(restaurants.count))

        return RestaurantsResponse(
            restaurants: restaurants,
            totalCount: total,
            hasMore: query.offset + query.limit < total
        )
    }

    // MARK: - Single Restaurant

    func fetchRestaurant(id: String) async throws -> Restaurant {
        let client = try db()
        let restaurant: Restaurant = try await client
            .from("restaurants")
            .select()
            .eq("id", value: id)
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
