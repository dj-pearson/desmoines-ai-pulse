import Foundation
import CoreLocation

/// What the map loads, as a role the tests can fake (IOS-DD-MAP-04).
/// Coordinates arrive already coarsened (LocationPrivacy.coarse).
protocol MapContentLoading: Sendable {
    func nearbyEvents(lat: Double, lng: Double, radiusMiles: Double, until: Date?) async throws -> [Event]
    func nearbyRestaurants(lat: Double, lng: Double, radiusMiles: Double) async throws -> [Restaurant]
    func nearbyAttractions(lat: Double, lng: Double, radiusMiles: Double) async throws -> [Attraction]
    func searchEvents(_ query: String) async throws -> [Event]
    func searchRestaurants(_ query: String) async throws -> [Restaurant]
    func searchAttractions(_ query: String) async throws -> [Attraction]
}

/// The three services the map has always used.
struct LiveMapContentLoader: MapContentLoading {
    /// Up to 200 events of the next two weeks (IOS-DD-MAP-01); the RPC clamps
    /// at the same number.
    static let eventLimit = 200

    func nearbyEvents(lat: Double, lng: Double, radiusMiles: Double, until: Date?) async throws -> [Event] {
        try await EventsService.shared.fetchNearbyEvents(
            latitude: lat, longitude: lng, radiusMiles: radiusMiles, limit: Self.eventLimit, until: until
        )
    }

    func nearbyRestaurants(lat: Double, lng: Double, radiusMiles: Double) async throws -> [Restaurant] {
        try await RestaurantsService.shared.fetchNearbyRestaurants(latitude: lat, longitude: lng, radiusMiles: radiusMiles)
    }

    func nearbyAttractions(lat: Double, lng: Double, radiusMiles: Double) async throws -> [Attraction] {
        try await AttractionsService.shared.fetchNearbyAttractions(latitude: lat, longitude: lng, radiusMiles: radiusMiles)
    }

    func searchEvents(_ query: String) async throws -> [Event] {
        try await EventsService.shared.fuzzySearchEvents(query: query, limit: 20)
    }

    func searchRestaurants(_ query: String) async throws -> [Restaurant] {
        try await RestaurantsService.shared.fuzzySearchRestaurants(query: query, limit: 20)
    }

    func searchAttractions(_ query: String) async throws -> [Attraction] {
        try await AttractionsService.shared.fetchAttractions(query: .init(searchText: query, limit: 50)).attractions
    }
}

/// The parts of LocationService the map uses, so tests can deny permission or
/// place the user in Omaha (IOS-DD-MAP-06).
@MainActor
protocol MapLocationProviding: AnyObject {
    var authorizationStatus: CLAuthorizationStatus { get }
    var accuracyAuthorization: CLAccuracyAuthorization { get }
    func awaitAuthorizationDecision(timeout: Duration) async -> CLAuthorizationStatus
    func getCurrentLocation() async throws -> CLLocation
    func distance(from coordinate: CLLocationCoordinate2D) -> Double?
    func formattedDistance(from coordinate: CLLocationCoordinate2D) -> String?
}

extension LocationService: MapLocationProviding {}
