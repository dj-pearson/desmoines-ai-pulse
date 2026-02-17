import Foundation
import MapKit
import SwiftUI

/// ViewModel for the map view showing nearby events, restaurants, and attractions.
@MainActor
@Observable
final class MapViewModel {
    private(set) var events: [Event] = []
    private(set) var restaurants: [Restaurant] = []
    private(set) var attractions: [Attraction] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?
    private(set) var hasLoadedOnce = false

    var showEvents = true
    var showRestaurants = true
    var showAttractions = true
    var selectedEvent: Event?
    var selectedRestaurant: Restaurant?
    var selectedAttraction: Attraction?
    var searchText = ""

    var cameraPosition: MapCameraPosition = .region(MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: Config.defaultLatitude, longitude: Config.defaultLongitude),
        span: MKCoordinateSpan(latitudeDelta: 0.15, longitudeDelta: 0.15)
    ))

    private let locationService = LocationService.shared
    private let eventsService = EventsService.shared
    private let restaurantsService = RestaurantsService.shared
    private let attractionsService = AttractionsService.shared

    /// Current center coordinates used for data fetching
    private var currentLatitude = Config.defaultLatitude
    private var currentLongitude = Config.defaultLongitude

    // MARK: - Load Data

    func loadNearbyContent() async {
        // In UI testing mode, skip location services entirely to avoid
        // permission dialogs and network delays on CI simulators.
        if Config.isUITesting {
            await loadDefaultArea()
            return
        }

        isLoading = true
        errorMessage = nil

        do {
            let location = try await locationService.getCurrentLocation()
            currentLatitude = location.coordinate.latitude
            currentLongitude = location.coordinate.longitude

            // Center map on user
            cameraPosition = .region(MKCoordinateRegion(
                center: location.coordinate,
                span: MKCoordinateSpan(latitudeDelta: 0.12, longitudeDelta: 0.12)
            ))

            await fetchAllContent()
        } catch {
            // Fall back to Des Moines center
            await loadDefaultArea()
        }

        isLoading = false
        hasLoadedOnce = true
    }

    func loadDefaultArea() async {
        isLoading = true
        currentLatitude = Config.defaultLatitude
        currentLongitude = Config.defaultLongitude

        await fetchAllContent()

        isLoading = false
        hasLoadedOnce = true
    }

    /// Fetch all content types independently so one failure doesn't block the others.
    private func fetchAllContent() async {
        let lat = currentLatitude
        let lng = currentLongitude

        // Fetch each type independently - if one fails, others still load
        let fetchedEvents: [Event]
        do {
            fetchedEvents = try await eventsService.fetchNearbyEvents(latitude: lat, longitude: lng)
        } catch {
            fetchedEvents = []
        }

        let fetchedRestaurants: [Restaurant]
        do {
            fetchedRestaurants = try await restaurantsService.fetchNearbyRestaurants(latitude: lat, longitude: lng)
        } catch {
            fetchedRestaurants = []
        }

        let fetchedAttractions: [Attraction]
        do {
            fetchedAttractions = try await attractionsService.fetchNearbyAttractions(latitude: lat, longitude: lng)
        } catch {
            fetchedAttractions = []
        }

        events = fetchedEvents
        restaurants = fetchedRestaurants
        attractions = fetchedAttractions

        if events.isEmpty && restaurants.isEmpty && attractions.isEmpty {
            if !Config.isConfigured {
                errorMessage = "Unable to connect to the server. Please check your internet connection."
            } else {
                errorMessage = "No places found in this area. Try expanding your search."
            }
        } else {
            errorMessage = nil
        }
    }

    // MARK: - Search

    func search() async {
        guard !searchText.trimmingCharacters(in: .whitespaces).isEmpty else {
            // Clear search - reload nearby content
            await fetchAllContent()
            return
        }

        isLoading = true
        errorMessage = nil
        clearSelection()

        // Search events by text
        let searchedEvents: [Event]
        do {
            searchedEvents = try await eventsService.fuzzySearchEvents(query: searchText)
        } catch {
            searchedEvents = []
        }

        // Search restaurants by text
        let searchedRestaurants: [Restaurant]
        do {
            searchedRestaurants = try await restaurantsService.fuzzySearchRestaurants(query: searchText)
        } catch {
            searchedRestaurants = []
        }

        // Search attractions by text
        let searchedAttractions: [Attraction]
        do {
            let response = try await attractionsService.fetchAttractions(
                query: .init(searchText: searchText, limit: 50)
            )
            searchedAttractions = response.attractions
        } catch {
            searchedAttractions = []
        }

        events = searchedEvents
        restaurants = searchedRestaurants
        attractions = searchedAttractions

        // If we got results, fit the map to show them
        let allCoords = (events.compactMap(\.coordinate)
                         + restaurants.compactMap(\.coordinate)
                         + attractions.compactMap(\.coordinate))
        if let region = regionFitting(coordinates: allCoords) {
            cameraPosition = .region(region)
        }

        if events.isEmpty && restaurants.isEmpty && attractions.isEmpty {
            errorMessage = "No results found for \"\(searchText)\""
        }

        isLoading = false
    }

    // MARK: - Retry

    func retry() async {
        await loadNearbyContent()
    }

    // MARK: - Clear Selection

    func clearSelection() {
        selectedEvent = nil
        selectedRestaurant = nil
        selectedAttraction = nil
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

    var attractionAnnotations: [AttractionAnnotation] {
        guard showAttractions else { return [] }
        return attractions.compactMap { attraction in
            guard let coord = attraction.coordinate else { return nil }
            return AttractionAnnotation(attraction: attraction, coordinate: coord)
        }
    }

    var totalPinCount: Int {
        eventAnnotations.count + restaurantAnnotations.count + attractionAnnotations.count
    }

    var isEmpty: Bool {
        hasLoadedOnce && !isLoading && totalPinCount == 0
    }

    // MARK: - Helpers

    private func regionFitting(coordinates: [CLLocationCoordinate2D]) -> MKCoordinateRegion? {
        guard !coordinates.isEmpty else { return nil }

        var minLat = coordinates[0].latitude
        var maxLat = coordinates[0].latitude
        var minLng = coordinates[0].longitude
        var maxLng = coordinates[0].longitude

        for coord in coordinates {
            minLat = min(minLat, coord.latitude)
            maxLat = max(maxLat, coord.latitude)
            minLng = min(minLng, coord.longitude)
            maxLng = max(maxLng, coord.longitude)
        }

        let center = CLLocationCoordinate2D(
            latitude: (minLat + maxLat) / 2,
            longitude: (minLng + maxLng) / 2
        )
        let span = MKCoordinateSpan(
            latitudeDelta: max((maxLat - minLat) * 1.3, 0.02),
            longitudeDelta: max((maxLng - minLng) * 1.3, 0.02)
        )
        return MKCoordinateRegion(center: center, span: span)
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

struct AttractionAnnotation: Identifiable {
    let attraction: Attraction
    let coordinate: CLLocationCoordinate2D
    var id: String { attraction.id }
}
