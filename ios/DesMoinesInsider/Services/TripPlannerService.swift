import Foundation
import Supabase

// MARK: - IOS-PARITY-001 · Native AI Trip Planner service
//
// Talks to the SAME backend as the web `useTripPlanner`:
//   • generate → `generate-itinerary` edge function (AI itinerary + server-side save)
//   • list     → `trip_plans` table (user's saved itineraries)
//   • details  → `get_trip_itinerary` RPC (day-by-day items)
//   • reorder  → `reorder_trip_items` RPC (one statement, ownership through RLS)
//   • usage    → `get_trip_planner_usage` RPC (this Central-time month's count)
//
// Quota (IOS-SUB-011): Insider 5 trips/month, VIP unlimited, free locked. The
// server enforces it in generate-itinerary against the trip_plan_generations
// ledger; the meter here reads the same ledger, so deleting a plan no longer
// looks like a refund (IOS-DD-TRIP-PLANNER-06).
//
// Sharing is text-only (TripShareText). The old share flipped is_public on
// the server before a target was chosen and linked to a web route that does
// not exist (IOS-DD-TRIP-PLANNER-07).
@MainActor
@Observable
final class TripPlannerService {
    static let shared = TripPlannerService()
    private init() {}

    private let supabase = SupabaseService.shared.client

    /// Whether trip storage exists (IOS-DD-TRIP-PLANNER-01). Read by Home,
    /// the planner and the dashboard to hide or explain the feature.
    private(set) var availability: TripPlannerAvailability = .unknown

    enum TripPlannerError: LocalizedError, Equatable {
        case notConfigured
        case offline
        case generationFailed(String?)
        case signInRequired
        /// 403 upgrade_required: the server does not see an entitlement.
        case needsUpgrade(message: String?)
        /// 429 quota_exceeded for the month.
        case monthlyQuota(message: String?)
        /// 429 quota_exceeded with period "day".
        case dailyLimit(message: String)
        /// AI budget paused, or trip storage missing. No upgrade lifts it.
        case unavailable(message: String?)
        /// Any other refusal the server explained, e.g. a 400 on the dates.
        case server(message: String)

        var errorDescription: String? {
            switch self {
            case .notConfigured: return "Trip Planner isn't configured."
            case .offline: return "You're offline. Reconnect to plan a trip."
            case .generationFailed(let msg):
                return msg ?? "We couldn't build that itinerary. Try adjusting your dates or interests."
            case .signInRequired: return "Sign in to plan a trip."
            case .needsUpgrade(let msg):
                return msg ?? "Trip Planner is an Insider feature."
            case .monthlyQuota(let msg):
                return msg ?? "You've used this month's itineraries."
            case .dailyLimit(let msg): return msg
            case .unavailable(let msg): return msg ?? TripPlannerAvailability.pausedMessage
            case .server(let msg): return msg
            }
        }
    }

    /// Maps a generate-itinerary error response to what the planner says
    /// (IOS-DD-TRIP-PLANNER-03). Every non-2xx used to read "Try adjusting your
    /// dates or interests", including the monthly quota, the daily cap, the AI
    /// pause and the storage outage, none of which a date change fixes.
    /// Modelled on AskPulseService.classify. nil means "no usable body".
    nonisolated static func classify(status: Int, body: Data) -> TripPlannerError? {
        struct Body: Decodable {
            let error: String?
            let code: String?
            let period: String?
            let upgradeHint: String?
        }
        guard !(200..<300).contains(status) else { return nil }
        let decoded = try? JSONDecoder().decode(Body.self, from: body)
        let message = decoded?.error.flatMap { $0.isEmpty ? nil : $0 }

        if status == 401 { return .signInRequired }
        if status == 403 || decoded?.code == "upgrade_required" { return .needsUpgrade(message: message) }
        if decoded?.code == "trip_storage_unavailable" { return .unavailable(message: message) }
        if status == 429 {
            switch decoded?.code {
            case "quota_exceeded":
                if decoded?.period == "day" {
                    return .dailyLimit(message: message ?? "You've reached today's limit of trip plans.")
                }
                return .monthlyQuota(message: message)
            case "ai_budget_paused":
                return .unavailable(message: message)
            default:
                break
            }
        }
        guard let message else { return nil }
        return .server(message: message)
    }

    // MARK: - Availability (IOS-DD-TRIP-PLANNER-01)

    /// Probes trip_plans. Missing table sets `.paused`; success sets
    /// `.available`; any other error (offline, timeout) leaves the state as it
    /// was, because it says nothing about whether the table exists.
    ///
    /// A GET of at most one id rather than a HEAD count: PostgREST answers a
    /// HEAD with no body, so the 42P01/PGRST205 code never reaches the client
    /// and a missing table would look like any other failure.
    func refreshAvailability() async {
        guard let client = supabase else { return }
        struct IdRow: Decodable { let id: String }
        do {
            let _: [IdRow] = try await client
                .from("trip_plans")
                .select("id")
                .limit(1)
                .execute()
                .value
            availability = .available
        } catch {
            if TripPlannerAvailability.isMissingStorage(error) { availability = .paused }
        }
    }

    // MARK: - Generate

    /// The generate-itinerary envelope. Internal rather than private so the
    /// decode is contract-locked by a test and cannot silently drift when the
    /// edge function changes shape (IOS-AUDIT-TEST-003).
    struct GenerateResponse: Decodable {
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
            availability = .available
            return plan
        } catch let error as TripPlannerError {
            throw error
        } catch {
            // The Functions client wraps non-2xx in FunctionsError.httpError;
            // read the body the function sent (IOS-DD-TRIP-PLANNER-03).
            if case let FunctionsError.httpError(code, data) = error,
               let classified = Self.classify(status: code, body: data) {
                if case .unavailable = classified { availability = .paused }
                throw classified
            }
            #if DEBUG
            AppLogger.network.warning("generate-itinerary failed: \(error.localizedDescription)")
            #endif
            throw TripPlannerError.generationFailed(nil)
        }
    }

    // MARK: - List / details

    /// The user's saved trips, newest first. Throws on a real failure so the
    /// list can say "couldn't load" instead of "none yet"
    /// (IOS-DD-TRIP-PLANNER-04). [] when signed out or unconfigured.
    func fetchTrips() async throws -> [TripPlan] {
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
            availability = .available
            return trips
        } catch {
            if TripPlannerAvailability.isMissingStorage(error) { availability = .paused }
            #if DEBUG
            AppLogger.network.warning("fetchTrips failed: \(error.localizedDescription)")
            #endif
            throw error
        }
    }

    /// Fetches a trip's items. Throws on a real fetch failure so the caller can
    /// distinguish "fetch failed" (show error+retry) from a genuinely empty
    /// itinerary (IOS-AUDIT-FEAT-023). Returns [] only when there is no client.
    func fetchItems(tripId: String) async throws -> [TripPlanItem] {
        guard let client = supabase else { return [] }
        struct Params: Encodable { let p_trip_id: String }
        let items: [TripPlanItem] = try await client
            .rpc("get_trip_itinerary", params: Params(p_trip_id: tripId))
            .execute()
            .value
        return items
    }

    // MARK: - Quota (IOS-SUB-011, IOS-DD-TRIP-PLANNER-04/06)

    /// Itineraries generated this Central-time month, from the same ledger
    /// generate-itinerary counts. It used to count the device-local month's
    /// trip_plans rows and return 0 on any error, which showed "5 of 5 left"
    /// offline and handed the allowance back when a plan was deleted.
    func usageThisMonth() async throws -> Int {
        guard let client = supabase,
              AuthService.shared.currentUser != nil else { return 0 }
        do {
            let used: Int = try await client
                .rpc("get_trip_planner_usage")
                .execute()
                .value
            return used
        } catch {
            if TripPlannerAvailability.isMissingStorage(error) { availability = .paused }
            throw error
        }
    }

    // MARK: - Mutations

    /// Deletes a trip. Returns true on success so the caller can roll back an
    /// optimistic removal on failure (IOS-AUDIT-FEAT-023).
    @discardableResult
    func deleteTrip(id: String) async -> Bool {
        guard let client = supabase else { return false }
        do {
            try await client.from("trip_plans").delete().eq("id", value: id).execute()
            return true
        } catch {
            #if DEBUG
            AppLogger.network.warning("deleteTrip failed: \(error.localizedDescription)")
            #endif
            return false
        }
    }

    /// Persists a new ordering of items within a day. Returns true only if the
    /// write succeeded so the caller can reconcile the UI with server truth on
    /// failure (IOS-AUDIT-FEAT-023).
    ///
    /// ONE STATEMENT (IOS-AUDIT-PERF-030, IOS-DD-TRIP-PLANNER-05). The
    /// `reorder_trip_items` RPC sets every stop's order_index from its position
    /// in `p_item_ids` in a single UPDATE, and raises if any id is not a stop of
    /// that trip and day, so the order either applies whole or not at all.
    /// Ownership is RLS's job (the function is SECURITY INVOKER). The previous
    /// upsert of {id, order_index} could never succeed: Postgres checks the
    /// proposed insert row's NOT NULL columns before conflict arbitration.
    @discardableResult
    func persistOrder(tripId: String, day: Int, items: [TripPlanItem]) async -> Bool {
        guard let client = supabase else { return false }
        guard !items.isEmpty else { return true }

        do {
            try await client
                .rpc("reorder_trip_items", params: Self.reorderParams(tripId: tripId, day: day, items: items))
                .execute()
            return true
        } catch {
            #if DEBUG
            AppLogger.network.warning("persistOrder failed for \(items.count) item(s): \(error.localizedDescription)")
            #endif
            return false
        }
    }

    /// The RPC arguments. Pure so the contract with the SQL in
    /// 20261014000001_trip_planner_storage_d1.sql (argument names, and that the
    /// id order IS the new order) is testable without a client.
    struct ReorderParams: Encodable, Equatable {
        let p_trip_id: String
        let p_day: Int
        let p_item_ids: [String]
    }

    nonisolated static func reorderParams(tripId: String, day: Int, items: [TripPlanItem]) -> ReorderParams {
        ReorderParams(p_trip_id: tripId, p_day: day, p_item_ids: items.map(\.itemId))
    }
}
