import Foundation
import Supabase

/// Fetches hotels/accommodations from Supabase, matching the web `useHotels`
/// hook + `/stay` query (active only, featured-first by default).
actor HotelsService {
    static let shared = HotelsService()

    private let supabase: SupabaseClient? = SupabaseService.shared.client

    enum ServiceError: LocalizedError {
        case notConfigured
        var errorDescription: String? { "Supabase is not configured." }
    }

    private func db() throws -> SupabaseClient {
        guard let supabase else { throw ServiceError.notConfigured }
        return supabase
    }

    enum Sort: String, CaseIterable, Identifiable {
        case featured = "Featured"
        case priceLow = "Price: Low"
        case priceHigh = "Price: High"
        case rating = "Top rated"
        case name = "Name"
        var id: String { rawValue }
    }

    struct HotelsQuery {
        var searchText: String?
        var areas: [String] = []
        var priceRanges: [String] = []
        var minStars: Double?
        var featuredOnly: Bool = false
        var sort: Sort = .featured
        var limit: Int = Config.defaultPageSize
        var offset: Int = 0
    }

    struct HotelsResponse {
        let hotels: [Hotel]
        let totalCount: Int
        let hasMore: Bool
    }

    // MARK: - List

    func fetchHotels(query: HotelsQuery = HotelsQuery()) async throws -> HotelsResponse {
        try await withRetry { [self] in try await _fetchHotels(query: query) }
    }

    private func _fetchHotels(query: HotelsQuery) async throws -> HotelsResponse {
        let client = try db()
        var request = client
            .from("hotels")
            .select("*", head: false, count: .exact)
            .eq("is_active", value: true)

        if let search = query.searchText, !search.isEmpty {
            request = request.or("name.ilike.%\(search)%,description.ilike.%\(search)%,area.ilike.%\(search)%,chain_name.ilike.%\(search)%")
        }
        if !query.areas.isEmpty {
            request = request.in("area", values: query.areas)
        }
        if !query.priceRanges.isEmpty {
            request = request.in("price_range", values: query.priceRanges)
        }
        if let minStars = query.minStars {
            request = request.gte("star_rating", value: minStars)
        }
        if query.featuredOnly {
            request = request.eq("is_featured", value: true)
        }

        // Sort (mirrors the web `useHotels` switch). Type inferred so we don't
        // depend on the Postgrest builder type names directly.
        let ordered = switch query.sort {
        case .featured:
            request
                .order("is_featured", ascending: false)
                .order("sort_order", ascending: true)
                .order("name", ascending: true)
        case .priceLow:
            request
                .order("avg_nightly_rate", ascending: true, nullsFirst: false)
                .order("name", ascending: true)
        case .priceHigh:
            request
                .order("avg_nightly_rate", ascending: false, nullsFirst: false)
                .order("name", ascending: true)
        case .rating:
            request
                .order("star_rating", ascending: false, nullsFirst: false)
                .order("name", ascending: true)
        case .name:
            request.order("name", ascending: true)
        }

        let finalRequest = ordered
            .range(from: query.offset, to: query.offset + query.limit - 1)

        let response = try await finalRequest.execute()
        let hotels = try JSONDecoder().decode([Hotel].self, from: response.data)
        let total = response.count ?? hotels.count

        return HotelsResponse(
            hotels: hotels,
            totalCount: total,
            hasMore: query.offset + query.limit < total
        )
    }

    // MARK: - Single

    func fetchHotel(id: String) async throws -> Hotel {
        try await withRetry { [self] in
            let client = try db()
            let hotel: Hotel = try await client
                .from("hotels")
                .select()
                .eq("id", value: id)
                .single()
                .execute()
                .value
            return hotel
        }
    }

    // MARK: - Filter options

    /// Distinct neighborhoods/areas for active hotels (filter chips). Fails soft.
    func fetchAreas() async -> [String] {
        guard let client = try? db() else { return [] }
        struct AreaRow: Decodable { let area: String? }
        do {
            let rows: [AreaRow] = try await client
                .from("hotels")
                .select("area")
                .eq("is_active", value: true)
                .not("area", operator: .is, value: "null")
                .execute()
                .value
            let areas = rows
                .compactMap { $0.area?.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            return Array(Set(areas)).sorted()
        } catch {
            return []
        }
    }
}
