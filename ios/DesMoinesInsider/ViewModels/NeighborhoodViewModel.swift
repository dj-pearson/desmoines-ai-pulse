import Foundation
import CoreLocation

/// Loads dining / attractions / events for one neighborhood (IOS-PARITY-006) by
/// matching each listing's city/location/venue to the area name, then (when the
/// user shares location) surfaces the nearest first — the "nearby in this
/// neighborhood" integration the AC calls for.
@MainActor
@Observable
final class NeighborhoodViewModel {
    let neighborhood: Neighborhood

    private(set) var restaurants: [Restaurant] = []
    private(set) var attractions: [Attraction] = []
    private(set) var events: [Event] = []
    private(set) var isLoading = true
    private(set) var usingLocation = false

    private let restaurantsService = RestaurantsService.shared
    private let attractionsService = AttractionsService.shared
    private let eventsService = EventsService.shared
    private let location = LocationService.shared

    init(neighborhood: Neighborhood) { self.neighborhood = neighborhood }

    var isEmpty: Bool { restaurants.isEmpty && attractions.isEmpty && events.isEmpty }

    func loadInitialData() async {
        guard isEmpty else { return }
        await refresh()
    }

    func refresh() async {
        isLoading = true

        async let restaurantsBatch = fetchRestaurants()
        async let attractionsBatch = fetchAttractions()
        async let eventsBatch = fetchEvents()
        let (allRestaurants, allAttractions, allEvents) = await (restaurantsBatch, attractionsBatch, eventsBatch)

        // Filter each batch to this neighborhood.
        var matchedRestaurants = allRestaurants.filter {
            neighborhood.matches($0.city) || neighborhood.matches($0.location) || neighborhood.matches($0.displayLocation)
        }
        var matchedAttractions = allAttractions.filter { neighborhood.matches($0.location) }
        let matchedEvents = allEvents.filter {
            neighborhood.matches($0.location) || neighborhood.matches($0.venue) || neighborhood.matches($0.city)
        }

        // Location integration: nearest first when we have a fix.
        if let userLocation = location.userLocation {
            usingLocation = true
            matchedRestaurants = sortByDistance(matchedRestaurants, from: userLocation) { $0.coordinate }
            matchedAttractions = sortByDistance(matchedAttractions, from: userLocation) { $0.coordinate }
        } else {
            usingLocation = false
        }

        restaurants = matchedRestaurants
        attractions = matchedAttractions
        events = matchedEvents
        isLoading = false
    }

    /// Ask for location so the "nearby" sort can kick in, then reload. Awaits an
    /// actual GPS fix instead of guessing with a fixed 1s sleep, so the sort
    /// still applies on a slow cold-GPS fix (IOS-AUDIT-UX-024).
    func enableNearby() async {
        location.requestPermission()
        isLoading = true
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

    // MARK: - Batches (broad fetch, filtered client-side by area)

    private func fetchRestaurants() async -> [Restaurant] {
        let query = RestaurantsService.RestaurantsQuery(limit: 60)
        return (try? await restaurantsService.fetchRestaurants(query: query))?.restaurants ?? []
    }

    private func fetchAttractions() async -> [Attraction] {
        let query = AttractionsService.AttractionsQuery(limit: 60)
        return (try? await attractionsService.fetchAttractions(query: query))?.attractions ?? []
    }

    private func fetchEvents() async -> [Event] {
        let query = EventsService.EventsQuery(limit: 60)
        return (try? await eventsService.fetchEvents(query: query))?.events ?? []
    }

    private func sortByDistance<T>(_ items: [T], from origin: CLLocation, coordinate: (T) -> CLLocationCoordinate2D?) -> [T] {
        items.sorted { a, b in
            let da = coordinate(a).map { origin.distance(from: CLLocation(latitude: $0.latitude, longitude: $0.longitude)) } ?? .greatestFiniteMagnitude
            let db = coordinate(b).map { origin.distance(from: CLLocation(latitude: $0.latitude, longitude: $0.longitude)) } ?? .greatestFiniteMagnitude
            return da < db
        }
    }
}
