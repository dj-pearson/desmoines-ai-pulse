import Foundation

/// ViewModel for the favorites/saved screen.
/// Supports events (upcoming + past), restaurants, and attractions.
///
/// Each section pages through its favorites in batches of
/// `FavoritesService.favoritesPageSize` so users with 100+ favorites don't pay
/// the full decode cost on every Saved tab open. Rows trigger
/// `loadMore*IfNeeded(currentItem:)` when they appear within 5 cells of the
/// end of the list, mirroring the RestaurantsView pagination pattern.
@MainActor
@Observable
final class FavoritesViewModel {
    var upcomingEvents: [Event] = []
    var pastEvents: [Event] = []
    var favoriteRestaurants: [Restaurant] = []
    var favoriteAttractions: [Attraction] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    // Per-section pagination state.
    private(set) var isLoadingMoreEvents = false
    private(set) var isLoadingMoreRestaurants = false
    private(set) var isLoadingMoreAttractions = false
    private(set) var hasMoreEvents = false
    private(set) var hasMoreRestaurants = false
    private(set) var hasMoreAttractions = false

    private var eventsOffset = 0
    private var restaurantsOffset = 0
    private var attractionsOffset = 0

    private let favoritesService = FavoritesService.shared
    private let auth = AuthService.shared
    private let pageSize = FavoritesService.favoritesPageSize

    var isAuthenticated: Bool { auth.isAuthenticated }

    var totalFavoriteCount: Int {
        favoritesService.favoriteEventIds.count
            + favoritesService.favoriteRestaurantIds.count
            + favoritesService.favoriteAttractionIds.count
    }

    var hasAnyFavorites: Bool {
        !upcomingEvents.isEmpty
            || !pastEvents.isEmpty
            || !favoriteRestaurants.isEmpty
            || !favoriteAttractions.isEmpty
    }

    // MARK: - Load

    func loadFavorites() async {
        guard auth.isAuthenticated else { return }

        isLoading = true
        errorMessage = nil

        // Refresh the favorite-ID sets first so pagination has something to
        // walk through. This is a cheap query (just the ID rows).
        await favoritesService.loadFavorites()

        // Reset offsets for a fresh paged load.
        upcomingEvents = []
        pastEvents = []
        favoriteRestaurants = []
        favoriteAttractions = []
        eventsOffset = 0
        restaurantsOffset = 0
        attractionsOffset = 0

        // Kick the first page of each section in parallel.
        async let events: () = loadNextEventsPage()
        async let restaurants: () = loadNextRestaurantsPage()
        async let attractions: () = loadNextAttractionsPage()
        _ = await (events, restaurants, attractions)

        isLoading = false
    }

    func refresh() async {
        await loadFavorites()
    }

    // MARK: - Pagination

    /// Fetch the next page of favorite events and split into upcoming/past.
    /// Safe to call concurrently — re-entry is guarded by `isLoadingMoreEvents`.
    private func loadNextEventsPage() async {
        guard !isLoadingMoreEvents else { return }
        guard eventsOffset == 0 || hasMoreEvents else { return }
        isLoadingMoreEvents = true
        defer { isLoadingMoreEvents = false }

        do {
            let page = try await favoritesService.fetchFavoriteEventsPage(
                offset: eventsOffset,
                limit: pageSize
            )
            let now = Date()
            for event in page.items {
                if let date = event.parsedDate, date < now {
                    pastEvents.append(event)
                } else {
                    upcomingEvents.append(event)
                }
            }
            hasMoreEvents = page.hasMore
            eventsOffset += pageSize
        } catch {
            errorMessage = error.localizedDescription
            hasMoreEvents = false
        }
    }

    private func loadNextRestaurantsPage() async {
        guard !isLoadingMoreRestaurants else { return }
        guard restaurantsOffset == 0 || hasMoreRestaurants else { return }
        isLoadingMoreRestaurants = true
        defer { isLoadingMoreRestaurants = false }

        do {
            let page = try await favoritesService.fetchFavoriteRestaurantsPage(
                offset: restaurantsOffset,
                limit: pageSize
            )
            favoriteRestaurants.append(contentsOf: page.items)
            hasMoreRestaurants = page.hasMore
            restaurantsOffset += pageSize
        } catch {
            // Restaurant favorites table may not exist yet — tolerate silently.
            hasMoreRestaurants = false
        }
    }

    private func loadNextAttractionsPage() async {
        guard !isLoadingMoreAttractions else { return }
        guard attractionsOffset == 0 || hasMoreAttractions else { return }
        isLoadingMoreAttractions = true
        defer { isLoadingMoreAttractions = false }

        do {
            let page = try await favoritesService.fetchFavoriteAttractionsPage(
                offset: attractionsOffset,
                limit: pageSize
            )
            favoriteAttractions.append(contentsOf: page.items)
            hasMoreAttractions = page.hasMore
            attractionsOffset += pageSize
        } catch {
            hasMoreAttractions = false
        }
    }

    /// Trigger the next events page when the user scrolls within 5 rows of
    /// the end of either the upcoming or past section.
    func loadMoreEventsIfNeeded(currentItem: Event) async {
        guard hasMoreEvents, !isLoadingMoreEvents else { return }
        let combined = upcomingEvents + pastEvents
        guard let idx = combined.firstIndex(where: { $0.id == currentItem.id }),
              idx >= combined.count - 5 else { return }
        await loadNextEventsPage()
    }

    func loadMoreRestaurantsIfNeeded(currentItem: Restaurant) async {
        guard hasMoreRestaurants, !isLoadingMoreRestaurants else { return }
        guard let idx = favoriteRestaurants.firstIndex(where: { $0.id == currentItem.id }),
              idx >= favoriteRestaurants.count - 5 else { return }
        await loadNextRestaurantsPage()
    }

    func loadMoreAttractionsIfNeeded(currentItem: Attraction) async {
        guard hasMoreAttractions, !isLoadingMoreAttractions else { return }
        guard let idx = favoriteAttractions.firstIndex(where: { $0.id == currentItem.id }),
              idx >= favoriteAttractions.count - 5 else { return }
        await loadNextAttractionsPage()
    }

    // MARK: - Remove

    func removeEventFavorite(eventId: String) async {
        do {
            try await favoritesService.toggleFavorite(eventId: eventId)
            upcomingEvents.removeAll { $0.id == eventId }
            pastEvents.removeAll { $0.id == eventId }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func removeRestaurantFavorite(restaurantId: String) async {
        do {
            try await favoritesService.toggleRestaurantFavorite(restaurantId: restaurantId)
            favoriteRestaurants.removeAll { $0.id == restaurantId }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func removeAttractionFavorite(attractionId: String) async {
        do {
            try await favoritesService.toggleFavoriteAttraction(attractionId: attractionId)
            favoriteAttractions.removeAll { $0.id == attractionId }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Backward Compatibility

    var favoriteEvents: [Event] { upcomingEvents + pastEvents }

    func removeFavorite(eventId: String) async {
        await removeEventFavorite(eventId: eventId)
    }

    func isFavorited(_ eventId: String) -> Bool {
        favoritesService.isFavorited(eventId)
    }

    var favoriteCount: Int { totalFavoriteCount }
}
