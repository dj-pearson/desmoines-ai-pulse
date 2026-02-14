import Foundation

/// Fetches attractions from Supabase, matching the web app's useAttractions hook.
actor AttractionsService {
    static let shared = AttractionsService()

    private let supabase = SupabaseService.shared.client

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
        var request = supabase
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

    func fetchAttraction(id: String) async throws -> Attraction {
        let attraction: Attraction = try await supabase
            .from("attractions")
            .select()
            .eq("id", value: id)
            .single()
            .execute()
            .value
        return attraction
    }
}
