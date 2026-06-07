import Foundation
import MapKit
import SwiftUI

/// ViewModel for the map view showing nearby events, restaurants, and attractions.
///
/// Annotation arrays (`eventAnnotations`, `restaurantAnnotations`,
/// `attractionAnnotations`) are **stored** properties recomputed only when
/// source data or category toggles change. Previously these were computed
/// properties that allocated fresh arrays on every SwiftUI re-read — with
/// 100+ pins that caused noticeable allocation pressure and map jank.
@MainActor
@Observable
final class MapViewModel {
    var events: [Event] = [] {
        didSet { refreshEventAnnotations() }
    }
    var restaurants: [Restaurant] = [] {
        didSet { refreshRestaurantAnnotations() }
    }
    var attractions: [Attraction] = [] {
        didSet { refreshAttractionAnnotations() }
    }
    private(set) var isLoading = false
    private(set) var errorMessage: String?
    private(set) var hasLoadedOnce = false

    var showEvents = true {
        didSet { refreshEventAnnotations() }
    }
    var showRestaurants = true {
        didSet { refreshRestaurantAnnotations() }
    }
    var showAttractions = true {
        didSet { refreshAttractionAnnotations() }
    }
    var selectedEvent: Event?
    var selectedRestaurant: Restaurant?
    var selectedAttraction: Attraction?
    var searchText = ""

    // Stored annotation caches. `private(set)` so the view can read but only
    // the ViewModel can mutate via the refresh helpers below.
    private(set) var eventAnnotations: [EventAnnotation] = []
    private(set) var restaurantAnnotations: [RestaurantAnnotation] = []
    private(set) var attractionAnnotations: [AttractionAnnotation] = []

    /// Time slider value (IOS-DISCOVER-2026-004). nil = "now" (live view).
    /// When non-nil, eventAnnotations are filtered to events within ±2h of
    /// this time and restaurantAnnotations to those open at this time.
    var mapTime: Date? = nil {
        didSet {
            refreshEventAnnotations()
            refreshRestaurantAnnotations()
        }
    }

    var cameraPosition: MapCameraPosition = .region(MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: Config.defaultLatitude, longitude: Config.defaultLongitude),
        span: MKCoordinateSpan(latitudeDelta: 0.15, longitudeDelta: 0.15)
    ))

    private var fetchTask: Task<Void, Never>?

    private let locationService = LocationService.shared
    private let eventsService = EventsService.shared
    private let restaurantsService = RestaurantsService.shared
    private let attractionsService = AttractionsService.shared

    /// Current center coordinates used for data fetching
    private var currentLatitude = Config.defaultLatitude
    private var currentLongitude = Config.defaultLongitude

    // MARK: - Load Data

    func loadNearbyContent() async {
        // Cancel any in-flight fetch
        fetchTask?.cancel()

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
            guard !Task.isCancelled else { return }
            currentLatitude = location.coordinate.latitude
            currentLongitude = location.coordinate.longitude

            // Center map on user
            cameraPosition = .region(MKCoordinateRegion(
                center: location.coordinate,
                span: MKCoordinateSpan(latitudeDelta: 0.12, longitudeDelta: 0.12)
            ))

            await fetchAllContent()
        } catch {
            guard !Task.isCancelled else { return }
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

    /// Fetch all content types concurrently so one failure doesn't block the others.
    private func fetchAllContent() async {
        let lat = currentLatitude
        let lng = currentLongitude

        // Fetch all types concurrently - if one fails, others still load
        async let fetchedEvents: [Event] = {
            do { return try await eventsService.fetchNearbyEvents(latitude: lat, longitude: lng) }
            catch { return [] }
        }()

        async let fetchedRestaurants: [Restaurant] = {
            do { return try await restaurantsService.fetchNearbyRestaurants(latitude: lat, longitude: lng) }
            catch { return [] }
        }()

        async let fetchedAttractions: [Attraction] = {
            do { return try await attractionsService.fetchNearbyAttractions(latitude: lat, longitude: lng) }
            catch { return [] }
        }()

        let (e, r, a) = await (fetchedEvents, fetchedRestaurants, fetchedAttractions)
        events = e
        restaurants = r
        attractions = a

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

        // If we got results, fit the map to show them. Compute the bounding
        // region off the main actor so 100+ coordinates don't block UI.
        let allCoords = (events.compactMap(\.coordinate)
                         + restaurants.compactMap(\.coordinate)
                         + attractions.compactMap(\.coordinate))
        if let region = await Self.regionFitting(coordinates: allCoords) {
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

    // MARK: - Annotation Refresh

    /// Cached ISO parsers — `refreshEventAnnotations` runs on every map-time
    /// slider change and parses each event's timestamp, so re-allocating
    /// ISO8601DateFormatters per refresh (with 100+ pins) is wasteful.
    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let isoFormatterFallback: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private func refreshEventAnnotations() {
        guard showEvents else {
            if !eventAnnotations.isEmpty { eventAnnotations = [] }
            return
        }
        let timeWindow: (Date, Date)? = mapTime.map { t in
            (t.addingTimeInterval(-2 * 3600), t.addingTimeInterval(2 * 3600))
        }
        eventAnnotations = events.compactMap { event in
            guard let coord = event.coordinate else { return nil }
            // IOS-DISCOVER-2026-004: filter events to ±2h window when slider
            // is engaged. Prefer eventStartLocal, fall back to date.
            if let (lo, hi) = timeWindow {
                let candidates = [event.eventStartLocal, event.date].compactMap { $0 }
                let parsed = candidates.compactMap { s in
                    Self.isoFormatter.date(from: s) ?? Self.isoFormatterFallback.date(from: s)
                }
                guard let when = parsed.first, when >= lo && when <= hi else { return nil }
            }
            return EventAnnotation(event: event, coordinate: coord)
        }
    }

    private func refreshRestaurantAnnotations() {
        guard showRestaurants else {
            if !restaurantAnnotations.isEmpty { restaurantAnnotations = [] }
            return
        }
        let probeTime = mapTime
        restaurantAnnotations = restaurants.compactMap { restaurant in
            guard let coord = restaurant.coordinate else { return nil }
            // IOS-DISCOVER-2026-004: when slider is engaged, hide restaurants
            // that won't be open at the slider time. Best-effort hours parse —
            // restaurants without parseable hours are kept (rather than hidden)
            // so we don't drop a pin just because the source is missing data.
            if let probeTime, !Self.isLikelyOpen(restaurant: restaurant, at: probeTime) {
                return nil
            }
            return RestaurantAnnotation(restaurant: restaurant, coordinate: coord)
        }
    }

    /// Best-effort "is this restaurant open at the given time" check.
    /// Returns true when there's no businessHours data so the slider doesn't
    /// hide pins because of data gaps. Defers to Restaurant.isOpenNow(at:).
    private static func isLikelyOpen(restaurant: Restaurant, at time: Date) -> Bool {
        return restaurant.isOpenNow(at: time) ?? true
    }

    private func refreshAttractionAnnotations() {
        guard showAttractions else {
            if !attractionAnnotations.isEmpty { attractionAnnotations = [] }
            return
        }
        attractionAnnotations = attractions.compactMap { attraction in
            guard let coord = attraction.coordinate else { return nil }
            return AttractionAnnotation(attraction: attraction, coordinate: coord)
        }
    }

    var totalPinCount: Int {
        eventAnnotations.count + restaurantAnnotations.count + attractionAnnotations.count
    }

    // MARK: - Clustering

    /// Threshold above which we switch from per-pin rendering to grid clusters.
    /// Tuned for a 6.1" display at the default zoom (~0.12° span).
    static let clusterThreshold = 60

    /// Returns true when the total visible annotation count exceeds the
    /// threshold and clustering should be used instead of individual pins.
    var shouldCluster: Bool { totalPinCount > Self.clusterThreshold }

    /// Collapses every annotation into a uniform grid of `MapCluster` pins.
    /// Grid size scales with the visible span so clusters stay roughly
    /// the same size on screen as the user zooms.
    ///
    /// Callers should only evaluate this when `shouldCluster == true`; it is
    /// O(n) in the total annotation count and recomputes on each read.
    func clusters(for region: MKCoordinateRegion) -> [MapCluster] {
        // Bucket size ≈ 1/8th of the latitude span — tight enough to preserve
        // geographic meaning, coarse enough to collapse dense areas.
        let latBucket = max(region.span.latitudeDelta / 8.0, 0.005)
        let lngBucket = max(region.span.longitudeDelta / 8.0, 0.005)

        var buckets: [BucketKey: MapCluster] = [:]

        func ingest(id: String, coord: CLLocationCoordinate2D, kind: MapCluster.Kind) {
            let key = BucketKey(
                lat: Int((coord.latitude / latBucket).rounded()),
                lng: Int((coord.longitude / lngBucket).rounded())
            )
            if var existing = buckets[key] {
                existing.memberIds.append(id)
                existing.addCoordinate(coord)
                existing.kinds.insert(kind)
                buckets[key] = existing
            } else {
                buckets[key] = MapCluster(
                    id: "\(key.lat):\(key.lng)",
                    coordinate: coord,
                    memberIds: [id],
                    kinds: [kind]
                )
            }
        }

        for a in eventAnnotations { ingest(id: a.id, coord: a.coordinate, kind: .event) }
        for a in restaurantAnnotations { ingest(id: a.id, coord: a.coordinate, kind: .restaurant) }
        for a in attractionAnnotations { ingest(id: a.id, coord: a.coordinate, kind: .attraction) }

        return Array(buckets.values)
    }

    private struct BucketKey: Hashable {
        let lat: Int
        let lng: Int
    }

    var isEmpty: Bool {
        hasLoadedOnce && !isLoading && totalPinCount == 0
    }

    // MARK: - Helpers

    /// Compute a bounding region around the given coordinates. Runs on a
    /// detached task so large result sets (100+ pins) don't block the UI.
    nonisolated static func regionFitting(coordinates: [CLLocationCoordinate2D]) async -> MKCoordinateRegion? {
        guard !coordinates.isEmpty else { return nil }

        return await Task.detached(priority: .userInitiated) {
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
        }.value
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

// MARK: - Cluster

/// A grid-bucket aggregate used when the total annotation count exceeds
/// `MapViewModel.clusterThreshold`. Stores the centroid of its members and
/// which categories are represented so the pin view can tint accordingly.
struct MapCluster: Identifiable {
    enum Kind: Hashable {
        case event
        case restaurant
        case attraction
    }

    let id: String
    private(set) var coordinate: CLLocationCoordinate2D
    var memberIds: [String]
    var kinds: Set<Kind>

    var count: Int { memberIds.count }

    /// Update the stored coordinate to the running centroid after each member
    /// is added. Keeps the cluster pin visually anchored to its members.
    mutating func addCoordinate(_ coord: CLLocationCoordinate2D) {
        let n = Double(memberIds.count)
        let newLat = (coordinate.latitude * (n - 1) + coord.latitude) / n
        let newLng = (coordinate.longitude * (n - 1) + coord.longitude) / n
        coordinate = CLLocationCoordinate2D(latitude: newLat, longitude: newLng)
    }

    /// Primary tint for rendering: prefer events (red) > restaurants (orange) > attractions (green).
    var tintColor: Color {
        if kinds.contains(.event) { return .red }
        if kinds.contains(.restaurant) { return .orange }
        return .green
    }
}
