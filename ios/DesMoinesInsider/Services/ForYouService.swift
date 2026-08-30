import Foundation

/// Client for the For You / Trending Now event rails. Decides which RPC to
/// call based on the user's swipe history (cold-start fallback under 5
/// swipes). IOS-DISCOVER-2026-002.
@MainActor
@Observable
final class ForYouService {
    static let shared = ForYouService()

    enum Source { case forYou, trending }

    struct Recommendation: Identifiable, Decodable, Hashable {
        let id: UUID
        let title: String?
        let date: String?
        let category: String?
        let imageUrl: String?
        let venue: String?
        let isFeatured: Bool?
        let recommendationScore: Double?
        let recommendationReason: String?

        enum CodingKeys: String, CodingKey {
            case id, title, date, category, venue
            case imageUrl = "image_url"
            case isFeatured = "is_featured"
            case recommendationScore = "recommendation_score"
            case recommendationReason = "recommendation_reason"
        }
    }

    private(set) var recommendations: [Recommendation] = []
    private(set) var source: Source = .trending
    private(set) var isLoading = false

    private let supabase = SupabaseService.shared.client

    /// Merges overlapping refreshes into one. ForYouRail calls refresh from
    /// both a `.task` and a manual button, and the `.task` re-fires whenever
    /// the view identity changes, so two calls landing together is ordinary
    /// rather than exceptional.
    private let refreshFlight = SingleFlight()

    private init() {}

    /// Decide which rail to show:
    /// - 5+ recent swipes → For You (personalized)
    /// - else → Trending Now (cold-start fallback)
    func refresh(limit: Int = 12) async {
        await refreshFlight.run { [weak self] in
            await self?.performRefresh(limit: limit)
        }
    }

    /// The refresh itself. Never call this directly - `refresh` is what
    /// guarantees one execution per overlapping group.
    ///
    /// The `guard !isLoading` this replaced dropped the second caller rather
    /// than joining it: that call returned immediately having awaited
    /// nothing, so `await refresh()` did not mean the data had arrived.
    private func performRefresh(limit: Int) async {
        guard let client = supabase else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            // Probe swipe count (only the count, no detail rows)
            let session = try? await client.auth.session
            let userId = session?.user.id

            var swipeCount = 0
            if let userId {
                struct CountWrapper: Decodable { let count: Int }
                let response = try await client
                    .from("swipe_interactions")
                    .select("*", head: false, count: .exact)
                    .eq("user_id", value: userId.uuidString)
                    .gte("created_at", value: ISO8601DateFormatter().string(from: Date().addingTimeInterval(-90 * 86400)))
                    .limit(1)
                    .execute()
                swipeCount = response.count ?? 0
            }

            if swipeCount >= 5 {
                source = .forYou
                struct Params: Encodable {
                    let p_user_lat: Double?
                    let p_user_lon: Double?
                    let p_limit: Int
                }
                let rows: [Recommendation] = try await client
                    .rpc("get_personalized_recommendations", params: Params(
                        p_user_lat: nil,
                        p_user_lon: nil,
                        p_limit: limit,
                    ))
                    .execute()
                    .value
                recommendations = rows
            } else {
                source = .trending
                struct TrendingParams: Encodable { let p_limit: Int }
                let rows: [Recommendation] = try await client
                    .rpc("get_trending_events", params: TrendingParams(p_limit: limit))
                    .execute()
                    .value
                recommendations = rows
            }
        } catch {
            #if DEBUG
            AppLogger.network.warning("ForYouService refresh failed: \(error.localizedDescription)")
            #endif
        }
    }
}
