import Foundation
import MapKit

/// ViewModel for the map view showing nearby events.
@MainActor
@Observable
final class MapViewModel {
    private(set) var events: [Event] = []
    private(set) var restaurants: [Restaurant] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    var showEvents = true
    var showRestaurants = true
    var selectedEvent: Event?
    var selectedRestaurant: Restaurant?

    var cameraPosition: MapCameraPosition = .region(MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: Config.defaultLatitude, longitude: Config.defaultLongitude),
        span: MKCoordinateSpan(latitudeDelta: 0.15, longitudeDelta: 0.15)
    ))

    private let locationService = LocationService.shared
    private let eventsService = EventsService.shared
    private let restaurantsService = RestaurantsService.shared

    // MARK: - Load Data

    func loadNearbyContent() async {
        isLoading = true
        errorMessage = nil

        do {
            let location = try await locationService.getCurrentLocation()
            let lat = location.coordinate.latitude
            let lng = location.coordinate.longitude

            // Center map on user
            cameraPosition = .region(MKCoordinateRegion(
                center: location.coordinate,
                span: MKCoordinateSpan(latitudeDelta: 0.12, longitudeDelta: 0.12)
            ))

            // Fetch nearby content in parallel
            async let nearbyEvents = eventsService.fetchNearbyEvents(latitude: lat, longitude: lng)
            async let nearbyRestaurants = restaurantsService.fetchNearbyRestaurants(latitude: lat, longitude: lng)

            events = try await nearbyEvents
            restaurants = try await nearbyRestaurants
        } catch {
            // Fall back to Des Moines center
            await loadDefaultArea()
        }

        isLoading = false
    }

    func loadDefaultArea() async {
        isLoading = true
        let lat = Config.defaultLatitude
        let lng = Config.defaultLongitude

        do {
            async let nearbyEvents = eventsService.fetchNearbyEvents(latitude: lat, longitude: lng)
            async let nearbyRestaurants = restaurantsService.fetchNearbyRestaurants(latitude: lat, longitude: lng)

            events = try await nearbyEvents
            restaurants = try await nearbyRestaurants
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Annotations

    var eventAnnotations: [EventAnnotation] {
        guard showEvents else { return [] }
        return events.compactMap { event in
            guard let coord = event.coordinate else { return nil }
            return EventAnnotation(event: event, coordinate: coord)
        }
    }

    var restaurantAnnotations: [RestaurantAnnotation] {
        guard showRestaurants else { return [] }
        return restaurants.compactMap { restaurant in
            guard let coord = restaurant.coordinate else { return nil }
            return RestaurantAnnotation(restaurant: restaurant, coordinate: coord)
        }
    }
}

// MARK: - Annotation Models

struct EventAnnotation: Identifiable {
    let event: Event
    let coordinate: CLLocationCoordinate2D
    var id: String { event.id }

    var tintColor: Color {
        guard let date = event.parsedDate else { return .blue }
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return .red }
        let days = calendar.dateComponents([.day], from: Date(), to: date).day ?? 0
        if days <= 7 { return .orange }
        return .blue
    }
}

struct RestaurantAnnotation: Identifiable {
    let restaurant: Restaurant
    let coordinate: CLLocationCoordinate2D
    var id: String { restaurant.id }
}

import SwiftUI
