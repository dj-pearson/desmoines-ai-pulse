import Foundation
import Supabase

/// CRUD for saved searches + alerts (IOS-PARITY-008) against the `saved_searches`
/// table (RLS: each user sees/writes only their own rows). The app stores the
/// saved search and its alert flag; delivery is a server-side job.
///
/// DELIVERY IS EMAIL, NOT PUSH, and this line used to say "a server-side job +
/// push ... and registers for push" (IOS-AUDIT-FEAT-012). The job is
/// supabase/functions/saved-search-alerts, whose own header reads "ONE
/// consolidated email per user with deep links back to the filtered /events",
/// sent through Resend. Nothing in this project can send a push at all: apns,
/// fcm and firebase messaging appear in none of the 157 edge functions.
///
/// The same wrong claim is still live in PaywallView.swift:115, which sells
/// "Push notifications for new matching events" - that one is user-facing copy
/// and changing it is a product call, so it is recorded rather than edited.
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

    /// The nightly alert job (`saved-search-alerts`) only scans rows where the
    /// top-level columns are `search_type = 'event_list' AND alerts_enabled = true`
    /// (see 20260623000003_saved_search_alerts.sql). Writing the alert flag only
    /// inside the `filters` JSON — as the app used to — meant iOS-created searches
    /// were never delivered alerts (IOS-AUDIT-FEAT-024). We now populate the
    /// top-level columns too. Only Events-tab searches map to the event pipeline;
    /// other tabs stay 'advanced' (no alert pipeline exists for them yet).
    static func searchType(for tab: String?) -> String {
        tab == "Events" ? "event_list" : "advanced"
    }

    @discardableResult
    func createSavedSearch(userId: String, name: String, filters: SavedSearchFilters) async throws -> SavedSearch {
        let client = try db()
        struct InsertRow: Encodable {
            let user_id: String
            let name: String
            let filters: SavedSearchFilters
            let search_type: String
            let alerts_enabled: Bool
        }
        let created: SavedSearch = try await client
            .from("saved_searches")
            .insert(InsertRow(
                user_id: userId,
                name: name,
                filters: filters,
                search_type: Self.searchType(for: filters.tab),
                alerts_enabled: filters.alertsEnabled
            ))
            .select()
            .single()
            .execute()
            .value
        return created
    }

    /// Persist a new filters payload (used to toggle the alert flag). Mirrors the
    /// alert flag and search type into the top-level columns the nightly job
    /// reads, self-healing rows written before IOS-AUDIT-FEAT-024.
    func updateFilters(id: String, filters: SavedSearchFilters) async throws {
        let client = try db()
        struct UpdateRow: Encodable {
            let filters: SavedSearchFilters
            let search_type: String
            let alerts_enabled: Bool
        }
        try await client
            .from("saved_searches")
            .update(UpdateRow(
                filters: filters,
                search_type: Self.searchType(for: filters.tab),
                alerts_enabled: filters.alertsEnabled
            ))
            .eq("id", value: id)
            .execute()
    }

    func deleteSavedSearch(id: String) async throws {
        let client = try db()
        try await client.from("saved_searches").delete().eq("id", value: id).execute()
    }
}
