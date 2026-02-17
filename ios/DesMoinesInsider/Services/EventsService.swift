import Foundation
import CoreLocation
import Supabase

/// Fetches events from Supabase, matching the web app's useEvents hook patterns.
/// Supports full-text search, category filtering, date ranges, and pagination.
actor EventsService {
    static let shared = EventsService()

    private let supabase: SupabaseClient?  = SupabaseService.shared.client

    enum ServiceError: LocalizedError {
        case notConfigured
        var errorDescription: String? { "Supabase is not configured." }
    }

    /// Unwrap the optional client or throw.
    private func db() throws -> SupabaseClient {
        guard let supabase else { throw ServiceError.notConfigured }
        return supabase
    }

    // MARK: - Fetch Events

    struct EventsQuery {
        var searchText: String?
        var category: String?
        var dateStart: Date?
        var dateEnd: Date?
        var isFeatured: Bool?
        var limit: Int = Config.defaultPageSize
        var offset: Int = 0
    }

    struct EventsResponse {
        let events: [Event]
        let totalCount: Int
        let hasMore: Bool
    }

    func fetchEvents(query: EventsQuery = EventsQuery()) async throws -> EventsResponse {
        let client = try db()
        let today = ISO8601DateFormatter().string(from: Calendar.current.startOfDay(for: Date()))

        var request = client
            .from("events")
            .select("*", head: false, count: .exact)
            .gte("date", value: today)

        // Full-text search
        if let search = query.searchText, !search.isEmpty {
            request = request.textSearch("search_vector", query: search, config: "english", type: .websearch)
        }

        // Category filter
        if let category = query.category, !category.isEmpty {
            request = request.eq("category", value: category)
        }

        // Date range
        if let start = query.dateStart {
            let startStr = ISO8601DateFormatter().string(from: start)
            request = request.gte("date", value: startStr)
        }
        if let end = query.dateEnd {
            let endStr = ISO8601DateFormatter().string(from: end)
            request = request.lt("date", value: endStr)
        }

        // Featured only
        if query.isFeatured == true {
            request = request.eq("is_featured", value: true)
        }

        // Sort + Paginate + Execute (transforms must come after all filters)
        let response = try await request
            .order("date", ascending: true)
            .range(from: query.offset, to: query.offset + query.limit - 1)
            .execute()
        let events = try JSONDecoder().decode([Event].self, from: response.data)
        let total = response.count ?? events.count

        return EventsResponse(
            events: events,
            totalCount: total,
            hasMore: query.offset + query.limit < total
        )
    }

    // MARK: - Fetch Single Event

    func fetchEvent(id: String) async throws -> Event {
        let client = try db()
        let event: Event = try await client
            .from("events")
            .select()
            .eq("id", value: id)
            .single()
            .execute()
            .value
        return event
    }

    // MARK: - Search Events (Fuzzy Fallback)

    func fuzzySearchEvents(query: String, limit: Int = 20) async throws -> [Event] {
        struct FuzzyParams: Encodable {
            let search_query: String
            let search_limit: Int
        }

        let client = try db()
        let events: [Event] = try await client
            .rpc("fuzzy_search_events", params: FuzzyParams(search_query: query, search_limit: limit))
            .execute()
            .value
        return events
    }

    // MARK: - Nearby Events

    func fetchNearbyEvents(latitude: Double, longitude: Double, radiusMiles: Double = 30, limit: Int = 50) async throws -> [Event] {
        // Try PostGIS RPC first for optimal performance
        if let rpcResults = try? await fetchNearbyEventsViaRPC(latitude: latitude, longitude: longitude, radiusMiles: radiusMiles, limit: limit),
           !rpcResults.isEmpty {
            return rpcResults
        }
        // Fallback: direct table query with client-side distance filtering
        return try await fetchNearbyEventsViaTable(latitude: latitude, longitude: longitude, radiusMiles: radiusMiles, limit: limit)
    }

    private func fetchNearbyEventsViaRPC(latitude: Double, longitude: Double, radiusMiles: Double, limit: Int) async throws -> [Event] {
        struct NearbyParams: Encodable {
            let user_lat: Double
            let user_lon: Double
            let radius_meters: Int
            let search_limit: Int
        }

        let client = try db()
        let events: [Event] = try await client
            .rpc("search_events_near_location", params: NearbyParams(
                user_lat: latitude,
                user_lon: longitude,
                radius_meters: Int(radiusMiles * 1609.34),
                search_limit: limit
            ))
            .execute()
            .value
        return events
    }

    private func fetchNearbyEventsViaTable(latitude: Double, longitude: Double, radiusMiles: Double, limit: Int) async throws -> [Event] {
        let client = try db()
        let today = ISO8601DateFormatter().string(from: Calendar.current.startOfDay(for: Date()))

        let events: [Event] = try await client
            .from("events")
            .select()
            .gte("date", value: today)
            .not("latitude", operator: .is, value: "null")
            .not("longitude", operator: .is, value: "null")
            .order("date", ascending: true)
            .limit(limit)
            .execute()
            .value

        let center = CLLocation(latitude: latitude, longitude: longitude)
        let radiusMeters = radiusMiles * 1609.34
        return events.filter { event in
            guard let coord = event.coordinate else { return false }
            let loc = CLLocation(latitude: coord.latitude, longitude: coord.longitude)
            return center.distance(from: loc) <= radiusMeters
        }
    }

    // MARK: - Featured Events

    func fetchFeaturedEvents(limit: Int = 10) async throws -> [Event] {
        let client = try db()
        let today = ISO8601DateFormatter().string(from: Calendar.current.startOfDay(for: Date()))

        let events: [Event] = try await client
            .from("events")
            .select()
            .eq("is_featured", value: true)
            .gte("date", value: today)
            .order("date", ascending: true)
            .limit(limit)
            .execute()
            .value
        return events
    }

    // MARK: - Related Events

    func fetchRelatedEvents(eventId: String, category: String, limit: Int = 6) async throws -> [Event] {
        let client = try db()
        let today = ISO8601DateFormatter().string(from: Calendar.current.startOfDay(for: Date()))

        let events: [Event] = try await client
            .from("events")
            .select()
            .eq("category", value: category)
            .neq("id", value: eventId)
            .gte("date", value: today)
            .order("date", ascending: true)
            .limit(limit)
            .execute()
            .value
        return events
    }
}
