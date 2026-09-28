import Foundation
import CoreLocation

/// Loads dining / attractions / events for one neighborhood (IOS-PARITY-006),
/// matched server-side by the neighborhood's `LocationArea` (IOS-DD-BROWSE-17),
/// then (when the user shares location) surfaces the nearest first.
@MainActor
@Observable
final class NeighborhoodViewModel {
    let neighborhood: Neighborhood

    private(set) var restaurants: [Restaurant] = []
    private(set) var attractions: [Attraction] = []
    private(set) var events: [Event] = []
    private(set) var isLoading = true
    private(set) var usingLocation = false
    /// True while the nearby sort waits for permission and a fix, which can
    /// take several seconds (IOS-DD-BROWSE-19).
    private(set) var isLocating = false
    /// Set only when all three sections failed (IOS-DD-BROWSE-18). A partial
    /// failure shows what did load; a failure used to read as "Still mapping
    /// this area".
    private(set) var loadError: String?
    /// A completed, non-cancelled load. The guard for loadInitialData, so an
    /// area that is genuinely empty is not refetched on every appearance.
    private(set) var hasLoadedOnce = false

    private let restaurantsService = RestaurantsService.shared
    private let attractionsService = AttractionsService.shared
    private let eventsService = EventsService.shared
    private let location = LocationService.shared

    private static let sectionLimit = 20

    init(neighborhood: Neighborhood) { self.neighborhood = neighborhood }

    var isEmpty: Bool { restaurants.isEmpty && attractions.isEmpty && events.isEmpty }

    func loadInitialData() async {
        guard !hasLoadedOnce else { return }
        await refresh()
    }

    func refresh() async {
        isLoading = true
        defer { isLoading = false }

        async let restaurantsBatch = fetchRestaurants()
        async let attractionsBatch = fetchAttractions()
        async let eventsBatch = fetchEvents()
        let (restaurantsResult, attractionsResult, eventsResult) = await (restaurantsBatch, attractionsBatch, eventsBatch)

        let outcomes = [
            restaurantsResult.map(\.count),
            attractionsResult.map(\.count),
            eventsResult.map(\.count),
        ]
        // Leaving the screen is not a load: nothing is written, and the next
        // appearance tries again.
        if Task.isCancelled || outcomes.allSatisfy({ Self.isCancelled($0) }) { return }

        // A failed section keeps what it had; only successes replace.
        let userLocation = location.userLocation
        usingLocation = userLocation != nil
        if case .success(var rows) = restaurantsResult {
            if let userLocation { rows = sortByDistance(rows, from: userLocation) { $0.coordinate } }
            restaurants = rows
        }
        if case .success(var rows) = attractionsResult {
            if let userLocation { rows = sortByDistance(rows, from: userLocation) { $0.coordinate } }
            attractions = rows
        }
        if case .success(let rows) = eventsResult {
            events = rows
        }
        loadError = Self.combinedError(outcomes)
        hasLoadedOnce = true
    }

    /// A message when every section failed for a reason other than
    /// cancellation, else nil. One section loading is enough to show the page.
    nonisolated static func combinedError(_ results: [Result<Int, Error>]) -> String? {
        var firstFailure: Error?
        for result in results {
            switch result {
            case .success:
                return nil
            case .failure(let error):
                if FavoritesService.isCancellation(error) { return nil }
                if firstFailure == nil { firstFailure = error }
            }
        }
        return firstFailure.map { _ in "Couldn't load this neighborhood. Check your connection and try again." }
    }

    private static func isCancelled(_ result: Result<Int, Error>) -> Bool {
        if case .failure(let error) = result { return FavoritesService.isCancellation(error) }
        return false
    }

    /// Ask for location so the "nearby" sort can kick in, then reload. Awaits an
    /// actual GPS fix instead of guessing with a fixed 1s sleep, so the sort
    /// still applies on a slow cold-GPS fix (IOS-AUDIT-UX-024).
    func enableNearby() async {
        location.requestPermission()
        isLocating = true
        defer { isLocating = false }
        nearbyUnavailable = false

        // Wait for the permission dialog to resolve (bounded), then await a
        // real fix — getCurrentLocation() has its own internal timeout.
        var waited: Duration = .zero
        while location.authorizationStatus == .notDetermined, waited < .seconds(8) {
            try? await Task.sleep(for: .milliseconds(200))
            waited += .milliseconds(200)
        }

        if LocationService.isAuthorized(location.authorizationStatus) {
            // A granted permission can still yield no fix - indoors, airplane
            // mode, or the service's own 10s timeout.
            nearbyUnavailable = (try? await location.getCurrentLocation()) == nil
        } else {
            // Denied, restricted, or the prompt was never answered. The button
            // used to do nothing visible in every one of those cases: the list
            // reloaded in the same order and the user had no way to tell whether
            // the feature was broken or they had said no months ago
            // (IOS-AUDIT-UX-057).
            nearbyUnavailable = true
        }

        await refresh()
    }

    /// The nearby sort was asked for and could not be applied. Drives the
    /// explanation in NeighborhoodDetailView; cleared on the next attempt.
    ///
    /// Deliberately one flag rather than a message: the view knows whether the
    /// user can fix it from Settings by reading authorizationStatus, and a
    /// string here would duplicate that decision.
    private(set) var nearbyUnavailable = false

    func dismissNearbyNotice() {
        nearbyUnavailable = false
    }

    // MARK: - Batches (matched server-side by area, IOS-DD-BROWSE-17)

    private func fetchRestaurants() async -> Result<[Restaurant], Error> {
        let query = RestaurantsService.RestaurantsQuery(locations: [neighborhood.area.rawValue], limit: Self.sectionLimit)
        do { return .success(try await restaurantsService.fetchRestaurants(query: query).restaurants) } catch { return .failure(error) }
    }

    private func fetchAttractions() async -> Result<[Attraction], Error> {
        let query = AttractionsService.AttractionsQuery(area: neighborhood.area, sortBy: .featured, limit: Self.sectionLimit)
        do { return .success(try await attractionsService.fetchAttractions(query: query).attractions) } catch { return .failure(error) }
    }

    private func fetchEvents() async -> Result<[Event], Error> {
        let query = EventsService.EventsQuery(cities: [neighborhood.area.rawValue], limit: Self.sectionLimit)
        do { return .success(try await eventsService.fetchEvents(query: query).events) } catch { return .failure(error) }
    }

    private func sortByDistance<T>(_ items: [T], from origin: CLLocation, coordinate: (T) -> CLLocationCoordinate2D?) -> [T] {
        items.sorted { a, b in
            let da = coordinate(a).map { origin.distance(from: CLLocation(latitude: $0.latitude, longitude: $0.longitude)) } ?? .greatestFiniteMagnitude
            let db = coordinate(b).map { origin.distance(from: CLLocation(latitude: $0.latitude, longitude: $0.longitude)) } ?? .greatestFiniteMagnitude
            return da < db
        }
    }
}
