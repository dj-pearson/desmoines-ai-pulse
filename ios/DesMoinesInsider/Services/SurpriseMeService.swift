import Foundation
import CoreLocation

/// Client for the get_surprise_pick RPC + outcome tracking. Powers the
/// "Surprise Me" button on the iOS Home tab (IOS-DISCOVER-2026-008).
@MainActor
@Observable
final class SurpriseMeService {
    static let shared = SurpriseMeService()

    struct Pick: Identifiable, Decodable, Hashable {
        var id: String { itemId.uuidString + ":" + itemType }
        let itemType: String
        let itemId: UUID
        let title: String?
        let description: String?
        let imageUrl: String?
        let reason: String
        let reasonTemplate: String?

        enum CodingKeys: String, CodingKey {
            case itemType = "item_type"
            case itemId = "item_id"
            case title
            case description
            case imageUrl = "image_url"
            case reason
            case reasonTemplate = "reason_template"
        }
    }

    enum Outcome: String { case shown, saved, tried_another, opened }

    /// RPC arguments. `p_exclude_ids` is left out when empty, so the call is
    /// the shipped two-argument one until there is something to exclude
    /// (IOS-DD-DISCOVER-17).
    struct Params: Encodable {
        let p_user_lat: Double?
        let p_user_lon: Double?
        let p_exclude_ids: [UUID]?

        init(location: CLLocation?, excluding: [UUID]) {
            p_user_lat = location?.coordinate.latitude
            p_user_lon = location?.coordinate.longitude
            p_exclude_ids = excluding.isEmpty ? nil : excluding
        }

        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encodeIfPresent(p_user_lat, forKey: .p_user_lat)
            try c.encodeIfPresent(p_user_lon, forKey: .p_user_lon)
            try c.encodeIfPresent(p_exclude_ids, forKey: .p_exclude_ids)
        }

        private enum CodingKeys: String, CodingKey {
            case p_user_lat, p_user_lon, p_exclude_ids
        }
    }

    /// One surprise_pick_outcomes row. Carries user_id: the insert policy
    /// allows the caller's own id or null, and every row used to be null, so
    /// acceptance could not be measured per user (IOS-DD-DISCOVER-17).
    struct OutcomeRow: Encodable {
        let item_type: String
        let item_id: UUID
        let outcome: String
        let reason_template: String?
        let user_id: UUID?
    }

    nonisolated static func outcomeRow(pick: Pick, outcome: Outcome, userId: UUID?) -> OutcomeRow {
        OutcomeRow(
            item_type: pick.itemType,
            item_id: pick.itemId,
            outcome: outcome.rawValue,
            reason_template: pick.reasonTemplate,
            user_id: userId
        )
    }

    nonisolated static func firstPick(_ rows: [Pick]) -> Pick? {
        rows.first
    }

    private let supabase = SupabaseService.shared.client

    private init() {}

    /// One pick, or nil when the server found nothing. Nothing used to throw
    /// "No surprise pick available", so the view's no-result state could never
    /// show (IOS-DD-DISCOVER-17).
    func surprise(at location: CLLocation? = nil, excluding: [UUID] = []) async throws -> Pick? {
        guard let client = supabase else {
            throw NSError(domain: "SurpriseMe", code: -1, userInfo: [NSLocalizedDescriptionKey: "Not configured"])
        }
        let rows: [Pick]
        do {
            rows = try await client
                .rpc("get_surprise_pick", params: Params(location: location, excluding: excluding))
                .execute()
                .value
        } catch {
            guard !excluding.isEmpty else { throw error }
            // A backend without the p_exclude_ids overload (before migration
            // 20261012000001) rejects the three-argument call. Roll without it.
            rows = try await client
                .rpc("get_surprise_pick", params: Params(location: location, excluding: []))
                .execute()
                .value
        }
        guard let pick = Self.firstPick(rows) else { return nil }
        // Fire-and-forget shown event for acceptance-rate analytics
        Task { try? await track(pick: pick, outcome: .shown) }
        return pick
    }

    func track(pick: Pick, outcome: Outcome) async throws {
        guard let client = supabase else { return }
        let row = Self.outcomeRow(pick: pick, outcome: outcome, userId: AuthService.shared.currentUser?.id)
        try await client
            .from("surprise_pick_outcomes")
            .insert(row)
            .execute()
    }
}
