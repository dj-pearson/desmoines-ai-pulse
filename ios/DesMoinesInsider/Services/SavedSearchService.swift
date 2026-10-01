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
        searchType(tab: tab, hadEventResults: false)
    }

    /// A search saved from another tab still matches events when it found
    /// some ("jazz" saved from Restaurants), so it is an event search for the
    /// alert job too (IOS-DD-SEARCH-10).
    static func searchType(tab: String?, hadEventResults: Bool) -> String {
        tab == "Events" || hadEventResults ? "event_list" : "advanced"
    }

    @discardableResult
    func createSavedSearch(
        userId: String,
        name: String,
        filters: SavedSearchFilters,
        searchType: String
    ) async throws -> SavedSearch {
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
                search_type: searchType,
                alerts_enabled: filters.alertsEnabled
            ))
            .select()
            .single()
            .execute()
            .value
        return created
    }

    /// Turn a search's alerts on or off (IOS-DD-SEARCH-09). Returns the number
    /// of rows written; 0 means the row is gone or not this user's.
    ///
    /// This replaced `updateFilters`, which overwrote `filters` with
    /// `{query, tab, alerts_enabled}` and set `search_type` from the tab. On a
    /// row the web wrote that destroyed its `q`/`category`/`preset` and moved
    /// it from 'event_list' to 'advanced', which the job never reads: one tap
    /// on the bell deleted the search's meaning and stopped its email. Now the
    /// caller passes the row's own filters with only `alerts_enabled` changed,
    /// and `search_type` is only ever promoted to 'event_list', never
    /// downgraded.
    func setAlerts(
        id: String,
        userId: String,
        enabled: Bool,
        mergedFilters: [String: SavedSearchJSON],
        promoteToEventList: Bool
    ) async throws -> Int {
        let client = try db()
        struct UpdateRow: Encodable {
            let alerts_enabled: Bool
            let filters: [String: SavedSearchJSON]
            let search_type: String?

            enum CodingKeys: String, CodingKey { case alerts_enabled, filters, search_type }

            // search_type is left out entirely unless it is being promoted, so
            // the update never writes it as null.
            func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encode(alerts_enabled, forKey: .alerts_enabled)
                try c.encode(filters, forKey: .filters)
                try c.encodeIfPresent(search_type, forKey: .search_type)
            }
        }
        struct IdRow: Decodable { let id: String }
        let rows: [IdRow] = try await client
            .from("saved_searches")
            .update(UpdateRow(
                alerts_enabled: enabled,
                filters: mergedFilters,
                search_type: promoteToEventList ? "event_list" : nil
            ))
            .eq("id", value: id)
            .eq("user_id", value: userId)
            .select("id")
            .execute()
            .value
        return rows.count
    }

    /// Delete one of the user's saved searches. Returns the number of rows
    /// deleted; RLS turns a delete of someone else's row into 0 rows rather
    /// than an error, so the caller treats 0 as a failure (IOS-DD-SEARCH-12).
    func deleteSavedSearch(id: String, userId: String) async throws -> Int {
        let client = try db()
        struct IdRow: Decodable { let id: String }
        let rows: [IdRow] = try await client
            .from("saved_searches")
            .delete()
            .eq("id", value: id)
            .eq("user_id", value: userId)
            .select("id")
            .execute()
            .value
        return rows.count
    }
}
