import Foundation

/// Fetches events from Supabase, matching the web app's useEvents hook patterns.
/// Supports full-text search, category filtering, date ranges, and pagination.
actor EventsService {
    static let shared = EventsService()

    private let supabase = SupabaseService.shared.client

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
        let today = ISO8601DateFormatter().string(from: Calendar.current.startOfDay(for: Date()))

        var request = supabase
            .from("events")
            .select("*", head: false, count: .exact)
            .gte("date", value: today)
            .order("date", ascending: true)

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

        // Pagination
        request = request.range(from: query.offset, to: query.offset + query.limit - 1)

        let response = try await request.execute()
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
        let event: Event = try await supabase
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

        let events: [Event] = try await supabase
            .rpc("fuzzy_search_events", params: FuzzyParams(search_query: query, search_limit: limit))
            .execute()
            .value
        return events
    }

    // MARK: - Nearby Events

    func fetchNearbyEvents(latitude: Double, longitude: Double, radiusMiles: Double = 30, limit: Int = 50) async throws -> [Event] {
        struct NearbyParams: Encodable {
            let user_lat: Double
            let user_lon: Double
            let radius_meters: Double
            let search_limit: Int
        }

        let events: [Event] = try await supabase
            .rpc("search_events_near_location", params: NearbyParams(
                user_lat: latitude,
                user_lon: longitude,
                radius_meters: radiusMiles * 1609.34,
                search_limit: limit
            ))
            .execute()
            .value
        return events
    }

    // MARK: - Featured Events

    func fetchFeaturedEvents(limit: Int = 10) async throws -> [Event] {
        let today = ISO8601DateFormatter().string(from: Calendar.current.startOfDay(for: Date()))

        let events: [Event] = try await supabase
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
        let today = ISO8601DateFormatter().string(from: Calendar.current.startOfDay(for: Date()))

        let events: [Event] = try await supabase
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
