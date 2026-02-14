import Foundation

/// Fetches restaurants from Supabase, matching the web app's useRestaurants hook.
actor RestaurantsService {
    static let shared = RestaurantsService()

    private let supabase = SupabaseService.shared.client

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
        var request = supabase
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

    // MARK: - Single Restaurant

    func fetchRestaurant(id: String) async throws -> Restaurant {
        let restaurant: Restaurant = try await supabase
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
        struct NearbyParams: Encodable {
            let center_lat: Double
            let center_lng: Double
            let radius_miles: Double
            let limit_count: Int
        }

        let restaurants: [Restaurant] = try await supabase
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

    // MARK: - Fuzzy Search Fallback

    func fuzzySearchRestaurants(query: String, limit: Int = 20) async throws -> [Restaurant] {
        struct FuzzyParams: Encodable {
            let search_query: String
            let search_limit: Int
        }

        let restaurants: [Restaurant] = try await supabase
            .rpc("fuzzy_search_restaurants", params: FuzzyParams(search_query: query, search_limit: limit))
            .execute()
            .value
        return restaurants
    }

    // MARK: - Cuisine List

    func fetchAvailableCuisines() async throws -> [String] {
        struct CuisineRow: Decodable {
            let cuisine: String?
        }
        let rows: [CuisineRow] = try await supabase
            .from("restaurants")
            .select("cuisine")
            .not("cuisine", operator: .is, value: "null")
            .order("cuisine", ascending: true)
            .execute()
            .value

        return Array(Set(rows.compactMap(\.cuisine))).sorted()
    }
}
