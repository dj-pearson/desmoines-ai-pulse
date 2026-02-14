import Foundation

/// Manages user favorites via the user_event_interactions table.
/// Matches the web app's useFavorites hook pattern.
@MainActor
@Observable
final class FavoritesService {
    static let shared = FavoritesService()

    private(set) var favoriteEventIds: Set<String> = []
    private(set) var isLoading = false

    private let supabase = SupabaseService.shared.client

    // MARK: - Load Favorites

    func loadFavorites() async {
        guard let userId = AuthService.shared.currentUser?.id.uuidString else {
            favoriteEventIds = []
            return
        }

        isLoading = true
        defer { isLoading = false }

        do {
            struct FavoriteRow: Decodable {
                let event_id: String
            }
            let rows: [FavoriteRow] = try await supabase
                .from("user_event_interactions")
                .select("event_id")
                .eq("user_id", value: userId)
                .eq("interaction_type", value: "favorite")
                .execute()
                .value

            favoriteEventIds = Set(rows.map(\.event_id))
        } catch {
            favoriteEventIds = []
        }
    }

    // MARK: - Toggle Favorite

    /// Returns true if the event is now favorited, false if unfavorited.
    @discardableResult
    func toggleFavorite(eventId: String) async throws -> Bool {
        guard let userId = AuthService.shared.currentUser?.id.uuidString else {
            throw FavoritesError.notAuthenticated
        }

        if favoriteEventIds.contains(eventId) {
            return try await removeFavorite(userId: userId, eventId: eventId)
        } else {
            return try await addFavorite(userId: userId, eventId: eventId)
        }
    }

    private func addFavorite(userId: String, eventId: String) async throws -> Bool {
        // Check subscription limits
        let maxFavorites = SubscriptionTier.free.maxFavorites // Default to free tier
        if maxFavorites > 0 && favoriteEventIds.count >= maxFavorites {
            throw FavoritesError.limitReached(max: maxFavorites)
        }

        struct InsertRow: Encodable {
            let user_id: String
            let event_id: String
            let interaction_type: String
        }

        try await supabase
            .from("user_event_interactions")
            .insert(InsertRow(user_id: userId, event_id: eventId, interaction_type: "favorite"))
            .execute()

        favoriteEventIds.insert(eventId)
        return true
    }

    private func removeFavorite(userId: String, eventId: String) async throws -> Bool {
        try await supabase
            .from("user_event_interactions")
            .delete()
            .eq("user_id", value: userId)
            .eq("event_id", value: eventId)
            .eq("interaction_type", value: "favorite")
            .execute()

        favoriteEventIds.remove(eventId)
        return false
    }

    // MARK: - Fetch Favorited Events

    func fetchFavoriteEvents() async throws -> [Event] {
        guard !favoriteEventIds.isEmpty else { return [] }

        let events: [Event] = try await supabase
            .from("events")
            .select()
            .in("id", values: Array(favoriteEventIds))
            .order("date", ascending: true)
            .execute()
            .value

        return events
    }

    // MARK: - Check if Favorited

    func isFavorited(_ eventId: String) -> Bool {
        favoriteEventIds.contains(eventId)
    }

    // MARK: - Error Types

    enum FavoritesError: LocalizedError {
        case notAuthenticated
        case limitReached(max: Int)

        var errorDescription: String? {
            switch self {
            case .notAuthenticated:
                return "Please sign in to save favorites."
            case .limitReached(let max):
                return "You've reached the limit of \(max) favorites. Upgrade to Insider for unlimited saves."
            }
        }
    }
}
