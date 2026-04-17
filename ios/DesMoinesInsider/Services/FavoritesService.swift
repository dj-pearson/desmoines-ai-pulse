import Foundation
import Supabase

/// Manages user favorites for both events and restaurants.
/// Event favorites use `user_event_interactions` table.
/// Restaurant favorites use `user_restaurant_interactions` table.
@MainActor
@Observable
final class FavoritesService {
    static let shared = FavoritesService()

    // MARK: - State

    private(set) var favoriteEventIds: Set<String> = []
    private(set) var favoriteRestaurantIds: Set<String> = []
    private(set) var favoriteAttractionIds: Set<String> = []
    private(set) var isLoading = false

    private let supabase: SupabaseClient? = SupabaseService.shared.client

    private func db() throws -> SupabaseClient {
        guard let supabase else { throw FavoritesError.notConfigured }
        return supabase
    }

    // ================================================================
    // MARK: - Event Favorites
    // ================================================================

    func loadFavorites() async {
        isLoading = true
        async let events: () = loadEventFavorites()
        async let restaurants: () = loadRestaurantFavorites()
        async let attractions: () = loadAttractionFavorites()
        _ = await (events, restaurants, attractions)
        isLoading = false
    }

    private func loadEventFavorites() async {
        guard let userId = AuthService.shared.currentUser?.id.uuidString else {
            favoriteEventIds = []
            return
        }

        do {
            let client = try db()
            struct FavoriteRow: Decodable {
                let event_id: String
            }
            let rows: [FavoriteRow] = try await client
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

    /// Toggle an event favorite. Returns `true` if now favorited, `false` if removed.
    @discardableResult
    func toggleFavorite(eventId: String) async throws -> Bool {
        guard let userId = AuthService.shared.currentUser?.id.uuidString else {
            throw FavoritesError.notAuthenticated
        }

        if favoriteEventIds.contains(eventId) {
            return try await removeEventFavorite(userId: userId, eventId: eventId)
        } else {
            return try await addEventFavorite(userId: userId, eventId: eventId)
        }
    }

    private func addEventFavorite(userId: String, eventId: String) async throws -> Bool {
        let maxFavorites = SubscriptionTier.free.maxFavorites
        if maxFavorites > 0 && favoriteEventIds.count >= maxFavorites {
            throw FavoritesError.limitReached(max: maxFavorites)
        }

        struct InsertRow: Encodable {
            let user_id: String
            let event_id: String
            let interaction_type: String
        }

        let client = try db()
        try await client
            .from("user_event_interactions")
            .insert(InsertRow(user_id: userId, event_id: eventId, interaction_type: "favorite"))
            .execute()

        favoriteEventIds.insert(eventId)
        return true
    }

    private func removeEventFavorite(userId: String, eventId: String) async throws -> Bool {
        let client = try db()
        try await client
            .from("user_event_interactions")
            .delete()
            .eq("user_id", value: userId)
            .eq("event_id", value: eventId)
            .eq("interaction_type", value: "favorite")
            .execute()

        favoriteEventIds.remove(eventId)
        return false
    }

    /// Fetch the full Event objects for all favorited event IDs.
    func fetchFavoriteEvents() async throws -> [Event] {
        guard !favoriteEventIds.isEmpty else { return [] }
        return try await withRetry {
            let client = try self.db()
            let events: [Event] = try await client
                .from("events")
                .select()
                .in("id", values: Array(self.favoriteEventIds))
                .order("date", ascending: true)
                .execute()
                .value
            return events
        }
    }

    func isEventFavorited(_ eventId: String) -> Bool {
        favoriteEventIds.contains(eventId)
    }

    // For backwards compatibility
    func isFavorited(_ eventId: String) -> Bool {
        isEventFavorited(eventId)
    }

    // ================================================================
    // MARK: - Restaurant Favorites
    // ================================================================

    private func loadRestaurantFavorites() async {
        guard let userId = AuthService.shared.currentUser?.id.uuidString else {
            favoriteRestaurantIds = []
            return
        }

        do {
            let client = try db()
            struct FavoriteRow: Decodable {
                let restaurant_id: String
            }
            let rows: [FavoriteRow] = try await client
                .from("user_restaurant_interactions")
                .select("restaurant_id")
                .eq("user_id", value: userId)
                .eq("interaction_type", value: "favorite")
                .execute()
                .value

            favoriteRestaurantIds = Set(rows.map(\.restaurant_id))
        } catch {
            // Table may not exist yet — fall back to local storage
            favoriteRestaurantIds = loadLocalRestaurantFavorites()
        }
    }

    /// Toggle a restaurant favorite. Returns `true` if now favorited, `false` if removed.
    @discardableResult
    func toggleRestaurantFavorite(restaurantId: String) async throws -> Bool {
        guard let userId = AuthService.shared.currentUser?.id.uuidString else {
            throw FavoritesError.notAuthenticated
        }

        if favoriteRestaurantIds.contains(restaurantId) {
            return try await removeRestaurantFavorite(userId: userId, restaurantId: restaurantId)
        } else {
            return try await addRestaurantFavorite(userId: userId, restaurantId: restaurantId)
        }
    }

    private func addRestaurantFavorite(userId: String, restaurantId: String) async throws -> Bool {
        do {
            struct InsertRow: Encodable {
                let user_id: String
                let restaurant_id: String
                let interaction_type: String
            }

            let client = try db()
            try await client
                .from("user_restaurant_interactions")
                .insert(InsertRow(user_id: userId, restaurant_id: restaurantId, interaction_type: "favorite"))
                .execute()
        } catch {
            // Table may not exist — save locally as fallback
            saveLocalRestaurantFavorite(restaurantId, add: true)
        }

        favoriteRestaurantIds.insert(restaurantId)
        return true
    }

    private func removeRestaurantFavorite(userId: String, restaurantId: String) async throws -> Bool {
        do {
            let client = try db()
            try await client
                .from("user_restaurant_interactions")
                .delete()
                .eq("user_id", value: userId)
                .eq("restaurant_id", value: restaurantId)
                .eq("interaction_type", value: "favorite")
                .execute()
        } catch {
            saveLocalRestaurantFavorite(restaurantId, add: false)
        }

        favoriteRestaurantIds.remove(restaurantId)
        return false
    }

    /// Fetch the full Restaurant objects for all favorited restaurant IDs.
    func fetchFavoriteRestaurants() async throws -> [Restaurant] {
        guard !favoriteRestaurantIds.isEmpty else { return [] }
        return try await withRetry {
            let client = try self.db()
            let restaurants: [Restaurant] = try await client
                .from("restaurants")
                .select()
                .in("id", values: Array(self.favoriteRestaurantIds))
                .order("name", ascending: true)
                .execute()
                .value
            return restaurants
        }
    }

    func isRestaurantFavorited(_ restaurantId: String) -> Bool {
        favoriteRestaurantIds.contains(restaurantId)
    }

    // ================================================================
    // MARK: - Attraction Favorites
    // ================================================================

    /// Load saved attractions for the current user. Falls back to local
    /// UserDefaults storage when the `user_attraction_interactions` table is
    /// not yet available (matches the restaurant-favorites fallback pattern).
    private func loadAttractionFavorites() async {
        guard let userId = AuthService.shared.currentUser?.id.uuidString else {
            favoriteAttractionIds = []
            return
        }

        do {
            let client = try db()
            struct FavoriteRow: Decodable {
                let attraction_id: String
            }
            let rows: [FavoriteRow] = try await client
                .from("user_attraction_interactions")
                .select("attraction_id")
                .eq("user_id", value: userId)
                .eq("interaction_type", value: "favorite")
                .execute()
                .value

            favoriteAttractionIds = Set(rows.map(\.attraction_id))
        } catch {
            // Table may not exist yet — fall back to local storage.
            favoriteAttractionIds = loadLocalAttractionFavorites()
        }
    }

    /// Toggle an attraction favorite. Returns `true` if now favorited, `false` if removed.
    @discardableResult
    func toggleFavoriteAttraction(attractionId: String) async throws -> Bool {
        guard let userId = AuthService.shared.currentUser?.id.uuidString else {
            throw FavoritesError.notAuthenticated
        }

        if favoriteAttractionIds.contains(attractionId) {
            return try await removeAttractionFavorite(userId: userId, attractionId: attractionId)
        } else {
            return try await addAttractionFavorite(userId: userId, attractionId: attractionId)
        }
    }

    private func addAttractionFavorite(userId: String, attractionId: String) async throws -> Bool {
        let maxFavorites = SubscriptionTier.free.maxFavorites
        if maxFavorites > 0 && favoriteAttractionIds.count >= maxFavorites {
            throw FavoritesError.limitReached(max: maxFavorites)
        }

        do {
            struct InsertRow: Encodable {
                let user_id: String
                let attraction_id: String
                let interaction_type: String
            }

            let client = try db()
            try await client
                .from("user_attraction_interactions")
                .insert(InsertRow(user_id: userId, attraction_id: attractionId, interaction_type: "favorite"))
                .execute()
        } catch {
            saveLocalAttractionFavorite(attractionId, add: true)
        }

        favoriteAttractionIds.insert(attractionId)
        return true
    }

    private func removeAttractionFavorite(userId: String, attractionId: String) async throws -> Bool {
        do {
            let client = try db()
            try await client
                .from("user_attraction_interactions")
                .delete()
                .eq("user_id", value: userId)
                .eq("attraction_id", value: attractionId)
                .eq("interaction_type", value: "favorite")
                .execute()
        } catch {
            saveLocalAttractionFavorite(attractionId, add: false)
        }

        favoriteAttractionIds.remove(attractionId)
        return false
    }

    /// Fetch the full Attraction objects for all favorited attraction IDs.
    func fetchFavoriteAttractions() async throws -> [Attraction] {
        guard !favoriteAttractionIds.isEmpty else { return [] }
        return try await withRetry {
            let client = try self.db()
            let attractions: [Attraction] = try await client
                .from("attractions")
                .select()
                .in("id", values: Array(self.favoriteAttractionIds))
                .order("name", ascending: true)
                .execute()
                .value
            return attractions
        }
    }

    func isAttractionFavorited(_ attractionId: String) -> Bool {
        favoriteAttractionIds.contains(attractionId)
    }

    // ================================================================
    // MARK: - Sign-Out Cleanup
    // ================================================================

    /// Clear all in-memory favorites and local-fallback storage. Call on sign-out
    /// so the next user on the same device starts with an empty Saved tab.
    func reset() {
        favoriteEventIds = []
        favoriteRestaurantIds = []
        favoriteAttractionIds = []
        UserDefaults.standard.removeObject(forKey: localRestaurantKey)
        UserDefaults.standard.removeObject(forKey: localAttractionKey)
    }

    // ================================================================
    // MARK: - Local Storage Fallback (Restaurant Favorites)
    // ================================================================

    private let localRestaurantKey = "localRestaurantFavorites"
    private let localAttractionKey = "localAttractionFavorites"

    private func loadLocalRestaurantFavorites() -> Set<String> {
        let array = UserDefaults.standard.stringArray(forKey: localRestaurantKey) ?? []
        return Set(array)
    }

    private func saveLocalRestaurantFavorite(_ id: String, add: Bool) {
        var favorites = loadLocalRestaurantFavorites()
        if add {
            favorites.insert(id)
        } else {
            favorites.remove(id)
        }
        UserDefaults.standard.set(Array(favorites), forKey: localRestaurantKey)
    }

    private func loadLocalAttractionFavorites() -> Set<String> {
        let array = UserDefaults.standard.stringArray(forKey: localAttractionKey) ?? []
        return Set(array)
    }

    private func saveLocalAttractionFavorite(_ id: String, add: Bool) {
        var favorites = loadLocalAttractionFavorites()
        if add {
            favorites.insert(id)
        } else {
            favorites.remove(id)
        }
        UserDefaults.standard.set(Array(favorites), forKey: localAttractionKey)
    }

    // ================================================================
    // MARK: - Error Types
    // ================================================================

    enum FavoritesError: LocalizedError {
        case notAuthenticated
        case limitReached(max: Int)
        case notConfigured

        var errorDescription: String? {
            switch self {
            case .notAuthenticated:
                return "Please sign in to save favorites."
            case .limitReached(let max):
                return "You've reached the limit of \(max) favorites. Upgrade to Insider for unlimited saves."
            case .notConfigured:
                return "Supabase is not configured."
            }
        }
    }
}
