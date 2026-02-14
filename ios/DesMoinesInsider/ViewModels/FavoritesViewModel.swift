import Foundation

/// ViewModel for the favorites/saved screen.
@MainActor
@Observable
final class FavoritesViewModel {
    private(set) var favoriteEvents: [Event] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    private let favoritesService = FavoritesService.shared
    private let auth = AuthService.shared

    var isAuthenticated: Bool { auth.isAuthenticated }
    var favoriteCount: Int { favoritesService.favoriteEventIds.count }

    // MARK: - Load

    func loadFavorites() async {
        guard auth.isAuthenticated else { return }

        isLoading = true
        errorMessage = nil

        await favoritesService.loadFavorites()

        do {
            favoriteEvents = try await favoritesService.fetchFavoriteEvents()
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func refresh() async {
        await loadFavorites()
    }

    // MARK: - Remove Favorite

    func removeFavorite(eventId: String) async {
        do {
            try await favoritesService.toggleFavorite(eventId: eventId)
            favoriteEvents.removeAll { $0.id == eventId }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func isFavorited(_ eventId: String) -> Bool {
        favoritesService.isFavorited(eventId)
    }
}
