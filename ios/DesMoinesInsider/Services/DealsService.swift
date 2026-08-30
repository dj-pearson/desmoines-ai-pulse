import Foundation
import Supabase

/// Fetches local deals (IOS-PARITY-010) from the same `deals` table the web
/// useDeals hook reads — featured first, then soonest to expire. RLS already
/// restricts SELECT to active deals (start_date ≤ now ≤ end_date).
actor DealsService {
    static let shared = DealsService()

    private let supabase: SupabaseClient? = SupabaseService.shared.client

    enum ServiceError: LocalizedError {
        case notConfigured
        var errorDescription: String? { "Supabase is not configured." }
    }

    private func db() throws -> SupabaseClient {
        guard let supabase else { throw ServiceError.notConfigured }
        return supabase
    }

    /// All active deals, optionally filtered by entity_type (the web "category").
    func fetchDeals(entityType: String? = nil) async throws -> [Deal] {
        try await withRetry { [self] in
            let client = try db()
            var request = client.from("deals").select()
            if let entityType, !entityType.isEmpty {
                request = request.eq("entity_type", value: entityType)
            }
            let deals: [Deal] = try await request
                .order("is_featured", ascending: false)
                .order("end_date", ascending: true, nullsFirst: false)
                .execute()
                .value
            return deals
        }
    }

    /// Best-effort redemption increment (parity with the web useClaimDeal RPC).
    func claimDeal(id: String) async {
        guard let client = try? db() else { return }
        struct Params: Encodable { let deal_id: String }
        _ = try? await client.rpc("increment_deal_redemption", params: Params(deal_id: id)).execute()
    }
}
