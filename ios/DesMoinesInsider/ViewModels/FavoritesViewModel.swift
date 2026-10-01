import Foundation

/// ViewModel for the Saved tab: events arranged as a plan for the week,
/// restaurants, attractions and guides.
///
/// Loads every saved row of each kind in chunks rather than paging by UUID
/// order, which put the soonest event on a later page and let a refresh during
/// load-more drop page one (IOS-DD-SAVED-09). The free cap is 3 and paid users
/// realistically hold tens, so the full fetch is cheap. A generation token
/// drops results from a load that a newer one replaced.
@MainActor
@Observable
final class FavoritesViewModel {
    /// Every loaded saved event, soonest first then id.
    private(set) var events: [Event] = []
    var favoriteRestaurants: [Restaurant] = []
    var favoriteAttractions: [Attraction] = []
    var favoriteArticles: [Article] = []

    private(set) var isLoading = false
    private(set) var hasLoadedOnce = false
    /// Set when any kind failed to load, or the id sets could not be read.
    private(set) var loadError: String?
    /// A removal or bulk action failed; shown as a toast (IOS-DD-SAVED-08).
    var transientError: String?

    /// Saved events and restaurants the server no longer returns (merged,
    /// hidden, archived or deleted). They still hold cap slots, so the tab
    /// offers to remove them (IOS-DD-SAVED-22).
    private(set) var unavailableEventIds: Set<String> = []
    private(set) var unavailableRestaurantIds: Set<String> = []

    /// Ids each load asked for, so reconcile knows what is new versus what
    /// the server did not return.
    private var requestedEventIds: Set<String> = []
    private var requestedRestaurantIds: Set<String> = []
    private var requestedAttractionIds: Set<String> = []
    private var requestedArticleIds: Set<String> = []

    private var generation = 0

    private let favoritesService = FavoritesService.shared
    private let auth = AuthService.shared

    var isAuthenticated: Bool { auth.isAuthenticated }

    /// The full-screen spinner shows only before the first load finishes;
    /// later loads keep the list on screen (IOS-DD-SAVED-13).
    var isInitialLoading: Bool { isLoading && !hasLoadedOnce }

    /// Saved items across all four kinds, without pending removals.
    var totalFavoriteCount: Int {
        favoritesService.totalFavoritesCount + favoritesService.visibleIds(.article).count
    }

    /// The count the free cap applies to (articles are free to save).
    var cappedFavoriteCount: Int { favoritesService.totalFavoritesCount }

    var unavailableCount: Int { unavailableEventIds.count + unavailableRestaurantIds.count }

    var hasAnyFavorites: Bool {
        !events.isEmpty
            || !favoriteRestaurants.isEmpty
            || !favoriteAttractions.isEmpty
            || !favoriteArticles.isEmpty
            || unavailableCount > 0
    }

    /// Events grouped Happening now / Today / This weekend / Next 7 days /
    /// Later / Past (IOS-DD-SAVED-18).
    func eventGroups(now: Date = Date()) -> [SavedEventGroup] {
        SavedPlan.arrange(events, now: now)
    }

    // MARK: - Load

    func load() async {
        guard auth.isAuthenticated else { return }
        generation += 1
        let token = generation
        isLoading = true
        defer { if token == generation { isLoading = false } }

        await favoritesService.loadFavorites()
        guard token == generation else { return }

        let eventIds = favoritesService.visibleIds(.event)
        let restaurantIds = favoritesService.visibleIds(.restaurant)
        let attractionIds = favoritesService.visibleIds(.attraction)
        let articleIds = favoritesService.visibleIds(.article)

        async let eventsResult = fetch { try await self.favoritesService.fetchFavoriteEvents(ids: eventIds.sorted()) }
        async let restaurantsResult = fetch { try await self.favoritesService.fetchFavoriteRestaurants(ids: restaurantIds.sorted()) }
        async let attractionsResult = fetch { try await self.favoritesService.fetchFavoriteAttractions(ids: attractionIds.sorted()) }
        async let articlesResult = fetch { try await self.favoritesService.fetchFavoriteArticles() }
        let (e, r, a, g) = await (eventsResult, restaurantsResult, attractionsResult, articlesResult)

        guard token == generation else { return }

        var failures: [String] = []
        switch e {
        case .success(let rows):
            events = Self.sortedEvents(rows)
            requestedEventIds = eventIds
            unavailableEventIds = Self.fetchedPrefix(eventIds).subtracting(rows.map(\.id))
        case .failure(let error):
            if !FavoritesService.isCancellation(error) { failures.append(error.localizedDescription) }
        }
        switch r {
        case .success(let rows):
            favoriteRestaurants = rows.sorted { $0.name < $1.name }
            requestedRestaurantIds = restaurantIds
            unavailableRestaurantIds = Self.fetchedPrefix(restaurantIds).subtracting(rows.map(\.id))
        case .failure(let error):
            if !FavoritesService.isCancellation(error) { failures.append(error.localizedDescription) }
        }
        switch a {
        case .success(let rows):
            favoriteAttractions = rows.sorted { $0.name < $1.name }
            requestedAttractionIds = attractionIds
        case .failure(let error):
            if !FavoritesService.isCancellation(error) { failures.append(error.localizedDescription) }
        }
        switch g {
        case .success(let rows):
            // fetchFavoriteArticles reads the whole set; drop pending removals.
            favoriteArticles = rows.filter { articleIds.contains($0.id) }
            requestedArticleIds = articleIds
        case .failure(let error):
            if !FavoritesService.isCancellation(error) { failures.append(error.localizedDescription) }
        }

        if favoritesService.lastLoadFailed && failures.isEmpty {
            failures.append("Some saved items couldn't be refreshed.")
        }
        loadError = failures.first
        hasLoadedOnce = true
        updatePastCount()
    }

    func refresh() async {
        await load()
    }

    /// Drops everything loaded for the previous account. The view model
    /// outlives a sign-out, so without this the next account on the device
    /// saw the last one's rows until its own load landed, and kept them if
    /// that load failed. Bumping the generation discards any load in flight.
    func clear() {
        generation += 1
        isLoading = false
        hasLoadedOnce = false
        loadError = nil
        transientError = nil
        events = []
        favoriteRestaurants = []
        favoriteAttractions = []
        favoriteArticles = []
        unavailableEventIds = []
        unavailableRestaurantIds = []
        requestedEventIds = []
        requestedRestaurantIds = []
        requestedAttractionIds = []
        requestedArticleIds = []
    }

    /// Brings the loaded rows in line with the service's sets after a heart
    /// changed elsewhere: drops rows no longer saved and fetches only new ids
    /// (IOS-DD-SAVED-13).
    func reconcile() async {
        guard auth.isAuthenticated, hasLoadedOnce, !isLoading else { return }
        let token = generation

        let eventDiff = SavedPlan.diff(loaded: requestedEventIds, current: favoritesService.visibleIds(.event))
        let restaurantDiff = SavedPlan.diff(loaded: requestedRestaurantIds, current: favoritesService.visibleIds(.restaurant))
        let attractionDiff = SavedPlan.diff(loaded: requestedAttractionIds, current: favoritesService.visibleIds(.attraction))
        let articleDiff = SavedPlan.diff(loaded: requestedArticleIds, current: favoritesService.visibleIds(.article))

        // Drop first: instant, no network.
        events.removeAll { eventDiff.toRemove.contains($0.id) }
        favoriteRestaurants.removeAll { restaurantDiff.toRemove.contains($0.id) }
        favoriteAttractions.removeAll { attractionDiff.toRemove.contains($0.id) }
        favoriteArticles.removeAll { articleDiff.toRemove.contains($0.id) }
        requestedEventIds.subtract(eventDiff.toRemove)
        requestedRestaurantIds.subtract(restaurantDiff.toRemove)
        requestedAttractionIds.subtract(attractionDiff.toRemove)
        requestedArticleIds.subtract(articleDiff.toRemove)
        unavailableEventIds.subtract(eventDiff.toRemove)
        unavailableRestaurantIds.subtract(restaurantDiff.toRemove)

        if !eventDiff.toFetch.isEmpty {
            let ids = eventDiff.toFetch
            if let rows = try? await favoritesService.fetchFavoriteEvents(ids: ids.sorted()), token == generation {
                let known = Set(events.map(\.id))
                events = Self.sortedEvents(events + rows.filter { !known.contains($0.id) })
                requestedEventIds.formUnion(ids)
                unavailableEventIds.formUnion(Self.fetchedPrefix(ids).subtracting(rows.map(\.id)))
            }
        }
        if !restaurantDiff.toFetch.isEmpty {
            let ids = restaurantDiff.toFetch
            if let rows = try? await favoritesService.fetchFavoriteRestaurants(ids: ids.sorted()), token == generation {
                let known = Set(favoriteRestaurants.map(\.id))
                favoriteRestaurants = (favoriteRestaurants + rows.filter { !known.contains($0.id) }).sorted { $0.name < $1.name }
                requestedRestaurantIds.formUnion(ids)
                unavailableRestaurantIds.formUnion(Self.fetchedPrefix(ids).subtracting(rows.map(\.id)))
            }
        }
        if !attractionDiff.toFetch.isEmpty {
            let ids = attractionDiff.toFetch
            if let rows = try? await favoritesService.fetchFavoriteAttractions(ids: ids.sorted()), token == generation {
                let known = Set(favoriteAttractions.map(\.id))
                favoriteAttractions = (favoriteAttractions + rows.filter { !known.contains($0.id) }).sorted { $0.name < $1.name }
                requestedAttractionIds.formUnion(ids)
            }
        }
        if !articleDiff.toFetch.isEmpty {
            if let rows = try? await favoritesService.fetchFavoriteArticles(), token == generation {
                let visible = favoritesService.visibleIds(.article)
                favoriteArticles = rows.filter { visible.contains($0.id) }
                requestedArticleIds = visible
            }
        }
        updatePastCount()
    }

    private func fetch<T>(_ operation: () async throws -> [T]) async -> Result<[T], Error> {
        do { return .success(try await operation()) } catch { return .failure(error) }
    }

    /// The ids a fetch actually asks for (sorted, capped at maxFetchIds), so
    /// ids past the cap are never mistaken for unavailable rows.
    static func fetchedPrefix(_ ids: Set<String>) -> Set<String> {
        Set(ids.sorted().prefix(FavoritesService.maxFetchIds))
    }

    static func sortedEvents(_ rows: [Event]) -> [Event] {
        rows.sorted { a, b in
            let da = a.parsedDate ?? .distantFuture
            let db = b.parsedDate ?? .distantFuture
            if da != db { return da < db }
            return a.id < b.id
        }
    }

    private func updatePastCount(now: Date = Date()) {
        favoritesService.pastEventFavoriteCount = events.filter { $0.isOver(at: now) }.count
    }

    // MARK: - Remove (committed after the undo window)

    /// Removes on the server; on failure puts the row back and reports it.
    @discardableResult
    func removeEventFavorite(_ event: Event) async -> Bool {
        do {
            try await favoritesService.removeFavorite(kind: .event, id: event.id)
            events.removeAll { $0.id == event.id }
            requestedEventIds.remove(event.id)
            updatePastCount()
            return true
        } catch {
            favoritesService.clearPendingRemoval(kind: .event, id: event.id)
            restore(event: event)
            transientError = "Couldn't remove \(event.title). Check your connection."
            return false
        }
    }

    @discardableResult
    func removeRestaurantFavorite(_ restaurant: Restaurant) async -> Bool {
        do {
            try await favoritesService.removeFavorite(kind: .restaurant, id: restaurant.id)
            favoriteRestaurants.removeAll { $0.id == restaurant.id }
            requestedRestaurantIds.remove(restaurant.id)
            return true
        } catch {
            favoritesService.clearPendingRemoval(kind: .restaurant, id: restaurant.id)
            restore(restaurant: restaurant)
            transientError = "Couldn't remove \(restaurant.name). Check your connection."
            return false
        }
    }

    @discardableResult
    func removeAttractionFavorite(_ attraction: Attraction) async -> Bool {
        do {
            try await favoritesService.removeFavorite(kind: .attraction, id: attraction.id)
            favoriteAttractions.removeAll { $0.id == attraction.id }
            requestedAttractionIds.remove(attraction.id)
            return true
        } catch {
            favoritesService.clearPendingRemoval(kind: .attraction, id: attraction.id)
            restore(attraction: attraction)
            transientError = "Couldn't remove \(attraction.name). Check your connection."
            return false
        }
    }

    @discardableResult
    func removeArticleFavorite(_ article: Article) async -> Bool {
        do {
            try await favoritesService.removeFavorite(kind: .article, id: article.id)
            favoriteArticles.removeAll { $0.id == article.id }
            requestedArticleIds.remove(article.id)
            return true
        } catch {
            favoritesService.clearPendingRemoval(kind: .article, id: article.id)
            restore(article: article)
            transientError = "Couldn't remove \(article.title). Check your connection."
            return false
        }
    }

    /// "Clear past events" (IOS-DD-SAVED-17).
    func clearPastEvents(now: Date = Date()) async {
        let past = events.filter { $0.isOver(at: now) }
        guard !past.isEmpty else { return }
        do {
            try await favoritesService.removeEventFavorites(ids: past.map(\.id))
            let ids = Set(past.map(\.id))
            events.removeAll { ids.contains($0.id) }
            requestedEventIds.subtract(ids)
            updatePastCount()
        } catch {
            transientError = "Couldn't clear past events. Check your connection."
        }
    }

    /// Removes saves the server no longer returns (IOS-DD-SAVED-22).
    func removeUnavailable() async {
        var failed = false
        for id in unavailableEventIds {
            do {
                try await favoritesService.removeFavorite(kind: .event, id: id)
                unavailableEventIds.remove(id)
                requestedEventIds.remove(id)
            } catch { failed = true }
        }
        for id in unavailableRestaurantIds {
            do {
                try await favoritesService.removeFavorite(kind: .restaurant, id: id)
                unavailableRestaurantIds.remove(id)
                requestedRestaurantIds.remove(id)
            } catch { failed = true }
        }
        if failed {
            transientError = "Couldn't remove every unavailable item. Try again."
        }
    }

    // MARK: - Optimistic hide and restore (undo)

    func hide(event: Event) {
        events.removeAll { $0.id == event.id }
    }

    func hide(restaurant: Restaurant) {
        favoriteRestaurants.removeAll { $0.id == restaurant.id }
    }

    func hide(attraction: Attraction) {
        favoriteAttractions.removeAll { $0.id == attraction.id }
    }

    func hide(article: Article) {
        favoriteArticles.removeAll { $0.id == article.id }
    }

    /// Re-inserts through the same ordering the load uses, so an undone event
    /// lands in its right group (IOS-DD-SAVED-10).
    func restore(event: Event) {
        guard !events.contains(where: { $0.id == event.id }) else { return }
        events = Self.sortedEvents(events + [event])
    }

    func restore(restaurant: Restaurant) {
        guard !favoriteRestaurants.contains(where: { $0.id == restaurant.id }) else { return }
        favoriteRestaurants = (favoriteRestaurants + [restaurant]).sorted { $0.name < $1.name }
    }

    func restore(attraction: Attraction) {
        guard !favoriteAttractions.contains(where: { $0.id == attraction.id }) else { return }
        favoriteAttractions = (favoriteAttractions + [attraction]).sorted { $0.name < $1.name }
    }

    func restore(article: Article) {
        guard !favoriteArticles.contains(where: { $0.id == article.id }) else { return }
        favoriteArticles.append(article)
    }
}
