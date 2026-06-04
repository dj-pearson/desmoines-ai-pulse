import Foundation

// MARK: - IOS-PARITY-001 · Native AI Trip Planner service
//
// Talks to the SAME backend as the web `useTripPlanner`:
//   • generate → `generate-itinerary` edge function (AI itinerary + server-side save)
//   • list     → `trip_plans` table (user's saved itineraries)
//   • details  → `get_trip_itinerary` RPC (day-by-day items)
//   • reorder  → updates `trip_plan_items.order_index`
//   • share    → flips `trip_plans.is_public` and returns the share_code
//
// Quota (IOS-SUB-011): Insider 5 trips/month, VIP unlimited, free locked. The
// month count is derived from `trip_plans.created_at`, and gating is enforced in
// the UI via `PremiumFeature.QuotaAction.tripPlans` + a contextual paywall.
@MainActor
@Observable
final class TripPlannerService {
    static let shared = TripPlannerService()
    private init() {}

    private let supabase = SupabaseService.shared.client

    enum TripPlannerError: LocalizedError {
        case notConfigured
        case offline
        case generationFailed(String?)

        var errorDescription: String? {
            switch self {
            case .notConfigured: return "Trip Planner isn't configured."
            case .offline: return "You're offline. Reconnect to plan a trip."
            case .generationFailed(let msg):
                return msg ?? "We couldn't build that itinerary. Try adjusting your dates or interests."
            }
        }
    }

    // MARK: - Generate

    private struct GenerateResponse: Decodable {
        let success: Bool
        let tripPlan: TripPlan?
        let error: String?
    }

    func generate(startDate: String, endDate: String, preferences: TripPreferences) async throws -> TripPlan {
        guard NetworkMonitor.shared.isConnected else { throw TripPlannerError.offline }
        guard let client = supabase else { throw TripPlannerError.notConfigured }

        struct Payload: Encodable {
            let startDate: String
            let endDate: String
            let preferences: TripPreferences
        }

        do {
            let response: GenerateResponse = try await client.functions.invoke(
                "generate-itinerary",
                options: .init(body: Payload(startDate: startDate, endDate: endDate, preferences: preferences)),
            )
            guard response.success, let plan = response.tripPlan else {
                throw TripPlannerError.generationFailed(response.error)
            }
            return plan
        } catch let error as TripPlannerError {
            throw error
        } catch {
            #if DEBUG
            AppLogger.network.warning("generate-itinerary failed: \(error.localizedDescription)")
            #endif
            throw TripPlannerError.generationFailed(nil)
        }
    }

    // MARK: - List / details

    func fetchTrips() async -> [TripPlan] {
        guard let client = supabase,
              let userId = AuthService.shared.currentUser?.id.uuidString else { return [] }
        do {
            let trips: [TripPlan] = try await client
                .from("trip_plans")
                .select("*")
                .eq("user_id", value: userId)
                .order("created_at", ascending: false)
                .execute()
                .value
            return trips
        } catch {
            #if DEBUG
            AppLogger.network.warning("fetchTrips failed: \(error.localizedDescription)")
            #endif
            return []
        }
    }

    func fetchItems(tripId: String) async -> [TripPlanItem] {
        guard let client = supabase else { return [] }
        struct Params: Encodable { let p_trip_id: String }
        do {
            let items: [TripPlanItem] = try await client
                .rpc("get_trip_itinerary", params: Params(p_trip_id: tripId))
                .execute()
                .value
            return items
        } catch {
            #if DEBUG
            AppLogger.network.warning("fetchItems failed: \(error.localizedDescription)")
            #endif
            return []
        }
    }

    // MARK: - Quota (IOS-SUB-011)

    /// Number of itineraries the user generated in the current calendar month.
    func tripsThisMonth() async -> Int {
        guard let client = supabase,
              let userId = AuthService.shared.currentUser?.id.uuidString else { return 0 }

        let cal = Calendar(identifier: .gregorian)
        let comps = cal.dateComponents([.year, .month], from: Date())
        let startOfMonth = cal.date(from: comps) ?? Date()
        let iso = ISO8601DateFormatter()

        struct Row: Decodable { let id: String }
        do {
            let rows: [Row] = try await client
                .from("trip_plans")
                .select("id")
                .eq("user_id", value: userId)
                .gte("created_at", value: iso.string(from: startOfMonth))
                .execute()
                .value
            return rows.count
        } catch {
            return 0
        }
    }

    // MARK: - Mutations

    func deleteTrip(id: String) async {
        guard let client = supabase else { return }
        do {
            try await client.from("trip_plans").delete().eq("id", value: id).execute()
        } catch {
            #if DEBUG
            AppLogger.network.warning("deleteTrip failed: \(error.localizedDescription)")
            #endif
        }
    }

    /// Persists a new ordering of items within a day by writing each item's
    /// `order_index`. Best-effort per item.
    func persistOrder(_ items: [TripPlanItem]) async {
        guard let client = supabase else { return }
        struct OrderUpdate: Encodable { let order_index: Int }
        for (index, item) in items.enumerated() {
            do {
                try await client
                    .from("trip_plan_items")
                    .update(OrderUpdate(order_index: index))
                    .eq("id", value: item.itemId)
                    .execute()
            } catch {
                #if DEBUG
                AppLogger.network.warning("persistOrder failed for \(item.itemId): \(error.localizedDescription)")
                #endif
            }
        }
    }

    /// Makes a trip public and returns its share code (web parity:
    /// /trips/shared/<code>).
    func share(tripId: String) async -> String? {
        guard let client = supabase else { return nil }
        struct ShareUpdate: Encodable { let is_public: Bool }
        struct CodeRow: Decodable { let share_code: String? }
        do {
            let row: CodeRow = try await client
                .from("trip_plans")
                .update(ShareUpdate(is_public: true))
                .eq("id", value: tripId)
                .select("share_code")
                .single()
                .execute()
                .value
            return row.share_code
        } catch {
            #if DEBUG
            AppLogger.network.warning("share failed: \(error.localizedDescription)")
            #endif
            return nil
        }
    }

    /// Public share URL for a code (matches the web route).
    func shareURL(for code: String) -> URL? {
        URL(string: "\(Config.siteURL.absoluteString)/trips/shared/\(code)")
    }
}
