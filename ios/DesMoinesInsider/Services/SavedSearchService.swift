import Foundation
import Supabase

/// CRUD for saved searches + alerts (IOS-PARITY-008) against the `saved_searches`
/// table (RLS: each user sees/writes only their own rows). The scheduled
/// new-match alert delivery is a server-side job + push; the app stores the
/// saved search and its alert flag and registers for push.
actor SavedSearchService {
    static let shared = SavedSearchService()

    private let supabase: SupabaseClient? = SupabaseService.shared.client

    enum ServiceError: LocalizedError {
        case notConfigured
        var errorDescription: String? { "Supabase is not configured." }
    }

    private func db() throws -> SupabaseClient {
        guard let supabase else { throw ServiceError.notConfigured }
        return supabase
    }

    func fetchSavedSearches(userId: String) async throws -> [SavedSearch] {
        try await withRetry { [self] in
            let client = try db()
            let searches: [SavedSearch] = try await client
                .from("saved_searches")
                .select()
                .eq("user_id", value: userId)
                .order("created_at", ascending: false)
                .execute()
                .value
            return searches
        }
    }

    @discardableResult
    func createSavedSearch(userId: String, name: String, filters: SavedSearchFilters) async throws -> SavedSearch {
        let client = try db()
        struct InsertRow: Encodable {
            let user_id: String
            let name: String
            let filters: SavedSearchFilters
        }
        let created: SavedSearch = try await client
            .from("saved_searches")
            .insert(InsertRow(user_id: userId, name: name, filters: filters))
            .select()
            .single()
            .execute()
            .value
        return created
    }

    /// Persist a new filters payload (used to toggle the alert flag).
    func updateFilters(id: String, filters: SavedSearchFilters) async throws {
        let client = try db()
        struct UpdateRow: Encodable { let filters: SavedSearchFilters }
        try await client
            .from("saved_searches")
            .update(UpdateRow(filters: filters))
            .eq("id", value: id)
            .execute()
    }

    func deleteSavedSearch(id: String) async throws {
        let client = try db()
        try await client.from("saved_searches").delete().eq("id", value: id).execute()
    }
}
