import Foundation
import Supabase

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
        /// `var` so the cold-start rerank can say why a row moved up
        /// (IOS-DD-ACCOUNT-04).
        var recommendationReason: String?

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

            // Saves are a signal too: three saved events is enough to
            // personalize without five swipes first (IOS-DD-EVENTS-20).
            let savedCount = FavoritesService.shared.favoriteEventIds.count
            var personalized: [Recommendation] = []
            if swipeCount >= 5 || savedCount >= 3 {
                personalized = await fetchPersonalized(client: client, limit: limit)
            }

            // An empty personalized answer falls back to trending rather than
            // leaving the rail blank.
            if !personalized.isEmpty {
                source = .forYou
                recommendations = personalized
            } else {
                source = .trending
                struct TrendingParams: Encodable { let p_limit: Int }
                let rows: [Recommendation] = try await client
                    .rpc("get_trending_events", params: TrendingParams(p_limit: limit))
                    .execute()
                    .value
                // Trending is the same list for everyone. Until the user has
                // swiped or saved enough to personalize, the interests they
                // picked in onboarding (or on their profile) float matching
                // events to the front (IOS-DD-ACCOUNT-04).
                recommendations = InterestCatalog.rerank(
                    rows,
                    interestIds: InterestPreferences.shared.effectiveInterests(
                        profile: AuthService.shared.currentProfile
                    )
                )
            }
        } catch {
            #if DEBUG
            AppLogger.network.warning("ForYouService refresh failed: \(error.localizedDescription)")
            #endif
        }
    }

    private struct PersonalizedParams: Encodable {
        let p_user_lat: Double?
        let p_user_lon: Double?
        let p_limit: Int
    }

    /// Personalized rows, or [] (which the caller turns into trending).
    ///
    /// v2 checks the account's "Personalized suggestions" switch
    /// (communication_preferences.event_recommendations) server-side and
    /// answers no rows unless it is on, so an opt-out made on the web holds
    /// here too (XPLAT-016, migration 20261108000105). v1 is the fallback only
    /// while v2 does not exist (PGRST202 / 42883); it is what older binaries
    /// call and is never changed (WEB-FEAT-034).
    private func fetchPersonalized(client: SupabaseClient, limit: Int) async -> [Recommendation] {
        let params = PersonalizedParams(p_user_lat: nil, p_user_lon: nil, p_limit: limit)
        do {
            return try await client
                .rpc("get_personalized_recommendations_v2", params: params)
                .execute()
                .value
        } catch {
            guard Self.isMissingFunctionError(error) else { return [] }
        }
        let rows: [Recommendation]? = try? await client
            .rpc("get_personalized_recommendations", params: params)
            .execute()
            .value
        return rows ?? []
    }

    /// PostgREST's "no such function" (PGRST202) or Postgres's (42883). Read
    /// structurally, like RestaurantsService.isMissingFunctionError, so a test
    /// can throw its own error with a `code`.
    nonisolated static func isMissingFunctionError(_ error: Error) -> Bool {
        let code: String?
        if let postgrest = error as? PostgrestError {
            code = postgrest.code
        } else {
            code = Mirror(reflecting: error).children.first { $0.label == "code" }?.value as? String
        }
        return code == "PGRST202" || code == "42883"
    }
}
