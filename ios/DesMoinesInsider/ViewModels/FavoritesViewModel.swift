import Foundation

/// ViewModel for the favorites/saved screen.
/// Supports events (upcoming + past) and restaurants.
@MainActor
@Observable
final class FavoritesViewModel {
    private(set) var upcomingEvents: [Event] = []
    private(set) var pastEvents: [Event] = []
    private(set) var favoriteRestaurants: [Restaurant] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    private let favoritesService = FavoritesService.shared
    private let auth = AuthService.shared

    var isAuthenticated: Bool { auth.isAuthenticated }

    var totalFavoriteCount: Int {
        favoritesService.favoriteEventIds.count + favoritesService.favoriteRestaurantIds.count
    }

    var hasAnyFavorites: Bool {
        !upcomingEvents.isEmpty || !pastEvents.isEmpty || !favoriteRestaurants.isEmpty
    }

    // MARK: - Load

    func loadFavorites() async {
        guard auth.isAuthenticated else { return }

        isLoading = true
        errorMessage = nil

        await favoritesService.loadFavorites()

        do {
            let allEvents = try await favoritesService.fetchFavoriteEvents()
            let now = Date()

            // Split events into upcoming and past
            upcomingEvents = allEvents.filter { event in
                guard let date = event.parsedDate else { return true }
                return date >= now
            }
            pastEvents = allEvents.filter { event in
                guard let date = event.parsedDate else { return false }
                return date < now
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        do {
            favoriteRestaurants = try await favoritesService.fetchFavoriteRestaurants()
        } catch {
            // Restaurant favorites table may not exist yet — that's OK
            favoriteRestaurants = []
        }

        isLoading = false
    }

    func refresh() async {
        await loadFavorites()
    }

    // MARK: - Remove Event Favorite

    func removeEventFavorite(eventId: String) async {
        do {
            try await favoritesService.toggleFavorite(eventId: eventId)
            upcomingEvents.removeAll { $0.id == eventId }
            pastEvents.removeAll { $0.id == eventId }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Remove Restaurant Favorite

    func removeRestaurantFavorite(restaurantId: String) async {
        do {
            try await favoritesService.toggleRestaurantFavorite(restaurantId: restaurantId)
            favoriteRestaurants.removeAll { $0.id == restaurantId }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Backward Compatibility

    // Keep for any code that still references this
    var favoriteEvents: [Event] { upcomingEvents + pastEvents }

    func removeFavorite(eventId: String) async {
        await removeEventFavorite(eventId: eventId)
    }

    func isFavorited(_ eventId: String) -> Bool {
        favoritesService.isFavorited(eventId)
    }

    var favoriteCount: Int { totalFavoriteCount }
}
