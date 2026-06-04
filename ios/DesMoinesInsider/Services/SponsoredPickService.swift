import Foundation

// MARK: - IOS-ADS-015 · Sponsored picks in AI discovery flows
//
// Client for the `get-sponsored-pick` edge function. Surfaces AT MOST ONE
// clearly-labeled sponsored listing inside the high-intent native AI flows
// (Ask Pulse, Surprise Me, and — once it ships — Trip Planner / IOS-PARITY-001).
//
// Relevance + eligibility live SERVER-SIDE (the edge function), so the app only
// asks "is there a sponsored pick for this surface + query?" and renders the
// result with a visible "Sponsored" label. Free-tier only: premium users are
// short-circuited locally (no network) AND re-checked server-side.
//
// Impressions/clicks are tracked through `AdTrackingService` under the
// `sponsored_listing` inventory class, sharing the same analytics + dedupe as
// the in-feed sponsored listings (IOS-ADS-011 / IOS-ADS-014).
@MainActor
@Observable
final class SponsoredPickService {
    static let shared = SponsoredPickService()
    private init() {}

    enum Surface: String {
        case askPulse = "ask_pulse"
        case surpriseMe = "surprise_me"
        case tripPlanner = "trip_planner"
    }

    struct SponsoredPick: Identifiable, Decodable, Hashable {
        let itemType: String   // "event" | "restaurant"
        let itemId: String
        let title: String
        let reason: String
        let imageUrl: String?
        let campaignId: String

        var id: String { "\(itemType)-\(itemId)" }
    }

    private let supabase = SupabaseService.shared.client
    private let storeKit = StoreKitService.shared
    private let tracking = AdTrackingService.shared

    /// Returns a sponsored pick for the surface, or nil when none is eligible.
    /// Always nil for premium tiers and during UI tests.
    func pick(for surface: Surface, query: String? = nil) async -> SponsoredPick? {
        guard !Config.isUITesting else { return nil }
        // Free-tier only — short-circuit before hitting the network.
        guard storeKit.currentTier == .free else { return nil }
        guard let client = supabase else { return nil }

        struct Payload: Encodable {
            let surface: String
            let query: String?
        }
        struct Envelope: Decodable {
            let pick: SponsoredPick?
        }

        do {
            let envelope: Envelope = try await client.functions.invoke(
                "get-sponsored-pick",
                options: .init(body: Payload(surface: surface.rawValue, query: query)),
            )
            return envelope.pick
        } catch {
            #if DEBUG
            AppLogger.network.warning("SponsoredPick fetch failed: \(error.localizedDescription)")
            #endif
            return nil
        }
    }

    func logImpression(_ pick: SponsoredPick, surface: Surface) {
        tracking.logSponsoredImpression(
            listingType: pick.itemType,
            listingId: pick.itemId,
            placement: surface.rawValue,
        )
    }

    func logClick(_ pick: SponsoredPick, surface: Surface) {
        tracking.logSponsoredClick(
            listingType: pick.itemType,
            listingId: pick.itemId,
            placement: surface.rawValue,
        )
    }
}
