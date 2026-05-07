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

    private let supabase = SupabaseService.shared.client

    private init() {}

    func surprise(at location: CLLocation? = nil) async throws -> Pick {
        guard let client = supabase else {
            throw NSError(domain: "SurpriseMe", code: -1, userInfo: [NSLocalizedDescriptionKey: "Not configured"])
        }
        struct Params: Encodable {
            let p_user_lat: Double?
            let p_user_lon: Double?
        }
        let params = Params(
            p_user_lat: location?.coordinate.latitude,
            p_user_lon: location?.coordinate.longitude,
        )
        let rows: [Pick] = try await client
            .rpc("get_surprise_pick", params: params)
            .execute()
            .value
        guard let pick = rows.first else {
            throw NSError(domain: "SurpriseMe", code: 404, userInfo: [NSLocalizedDescriptionKey: "No surprise pick available"])
        }
        // Fire-and-forget shown event for acceptance-rate analytics
        Task { try? await track(pick: pick, outcome: .shown) }
        return pick
    }

    func track(pick: Pick, outcome: Outcome) async throws {
        guard let client = supabase else { return }
        struct Row: Encodable {
            let item_type: String
            let item_id: UUID
            let outcome: String
            let reason_template: String?
        }
        let row = Row(
            item_type: pick.itemType,
            item_id: pick.itemId,
            outcome: outcome.rawValue,
            reason_template: pick.reasonTemplate,
        )
        try await client
            .from("surprise_pick_outcomes")
            .insert(row)
            .execute()
    }
}
