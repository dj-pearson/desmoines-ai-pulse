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

    struct AttractionsQuery {
        var searchText: String?
        var type: String?
        var minRating: Double?
        var isFeatured: Bool?
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

    private func _fetchAttractions(query: AttractionsQuery) async throws -> AttractionsResponse {
        let client = try db()
        var request = client
            .from("attractions")
            .select("*", head: false, count: .exact)

        // Search (multi-field ILIKE — matches web pattern)
        if let search = query.searchText, !search.isEmpty {
            request = request.or("name.ilike.%\(search)%,type.ilike.%\(search)%,location.ilike.%\(search)%")
        }

        // Type filter
        if let type = query.type, !type.isEmpty {
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

        // Order and pagination (transforms must come after all filters)
        let finalRequest = request
            .order("created_at", ascending: false)
            .range(from: query.offset, to: query.offset + query.limit - 1)

        let response = try await finalRequest.execute()
        let attractions = try JSONDecoder().decode([Attraction].self, from: response.data)
        let total = response.count ?? attractions.count

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
    func fetchNearbyAttractions(latitude: Double, longitude: Double, limit: Int = 50) async throws -> [Attraction] {
        let client = try db()
        let radiusMiles = Config.defaultSearchRadiusMiles

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

    func fetchAttraction(id: String) async throws -> Attraction {
        let client = try db()
        let attraction: Attraction = try await client
            .from("attractions")
            .select()
            .eq("id", value: id)
            .single()
            .execute()
            .value
        return attraction
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
