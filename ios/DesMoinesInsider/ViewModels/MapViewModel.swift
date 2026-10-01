import Foundation
import MapKit
import SwiftUI

/// ViewModel for the map view showing nearby events, restaurants, and attractions.
///
/// Annotation arrays (`eventAnnotations`, `restaurantAnnotations`,
/// `attractionAnnotations`) are **stored** properties recomputed only when
/// source data or filters change. Previously these were computed
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
    private(set) var hasLoadedOnce = false

    /// Why the map is not centred on the user, if it is not (IOS-DD-MAP-06).
    private(set) var locationNotice: LocationNotice = .none
    /// Kinds whose last fetch failed; their previous rows are kept
    /// (IOS-DD-MAP-10).
    private(set) var failedKinds: Set<MapCluster.Kind> = []
    /// The submitted search, nil while browsing nearby. `searchText` is what is
    /// typed; this is what the pins are showing.
    private(set) var activeQuery: String?
    /// The visible region is too wide to load ("Zoom in to see places").
    private(set) var needsZoomIn = false
    /// Search results not drawn or fitted because they are outside the metro
    /// or implausible (IOS-DD-MAP-11).
    private(set) var searchResultsOutsideArea = 0
    /// Restaurants hidden by a time or Open now filter because their hours
    /// are unknown (IOS-DD-MAP-02). Fail closed, as the Dining tab's Open Now.
    private(set) var restaurantsHiddenUnknownHours = 0
    /// Pinnable rows per kind before filters, for the overlay.
    private(set) var rawCounts: [MapCluster.Kind: Int] = [:]

    var showEvents = true {
        didSet { refreshEventAnnotations() }
    }
    var showRestaurants = true {
        didSet { refreshRestaurantAnnotations() }
    }
    var showAttractions = true {
        didSet { refreshAttractionAnnotations() }
    }
    /// Quick filter: events on now and restaurants open now (IOS-DD-MAP-13).
    /// Attractions are left alone; they carry no hours.
    var openNowOnly = false {
        didSet { refreshAllAnnotations() }
    }
    /// Quick filter: within `walkableMiles` of the user (IOS-DD-MAP-13).
    var walkableOnly = false {
        didSet { refreshAllAnnotations() }
    }
    /// Time filter (IOS-DD-MAP-07). The window is recomputed from the clock
    /// at every refresh, so "Now" stays now.
    var timeChip: MapTimeChip = .anytime {
        didSet {
            refreshEventAnnotations()
            refreshRestaurantAnnotations()
        }
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
    /// Lookups for the render items, which carry ids only.
    private(set) var eventIndex: [String: EventAnnotation] = [:]
    private(set) var restaurantIndex: [String: RestaurantAnnotation] = [:]
    private(set) var attractionIndex: [String: AttractionAnnotation] = [:]
    /// Bumped on every annotation refresh. The view recomputes its render
    /// items on this rather than on the pin count, which missed a filter that
    /// swapped members without changing the total (IOS-DD-MAP-08).
    private(set) var annotationsVersion = 0

    var cameraPosition: MapCameraPosition = .region(MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: Config.defaultLatitude, longitude: Config.defaultLongitude),
        span: MKCoordinateSpan(latitudeDelta: 0.15, longitudeDelta: 0.15)
    ))

    /// The user panned or zoomed after the first load, so a reload must not
    /// yank the camera back (IOS-DD-MAP-04).
    private(set) var userMovedCamera = false
    /// The region the pins were last loaded for; drives "Search this area".
    private(set) var lastFetchRegion: MKCoordinateRegion?

    @ObservationIgnored private var isProgrammaticCameraMove = false
    @ObservationIgnored private var visibleRegion: MKCoordinateRegion?
    @ObservationIgnored private var fetchTask: Task<Void, Never>?
    @ObservationIgnored private var lastLoadedAt: Date?
    @ObservationIgnored private var dismissedNotice: LocationNotice?

    /// Current center and radius used for data fetching.
    @ObservationIgnored private var currentLatitude = Config.defaultLatitude
    @ObservationIgnored private var currentLongitude = Config.defaultLongitude
    @ObservationIgnored private var radiusMiles = Config.defaultSearchRadiusMiles

    private let loader: MapContentLoading
    private let location: MapLocationProviding
    private let now: () -> Date

    // Computed and nonisolated so the pure static rules below (and tests)
    // can read them off the main actor; a stored static on this @MainActor
    // class would be main-actor isolated.

    /// Data older than this is reloaded when the map reappears.
    nonisolated static var staleAfter: TimeInterval { 600 }
    /// How far ahead nearby events are loaded: covers "Sat night" from any day.
    nonisolated static var eventHorizon: TimeInterval { 14 * 86400 }
    /// Further than this from downtown and the map shows downtown instead.
    nonisolated static var metroRadiusMiles: Double { 40.0 }
    /// "Walkable" means within this many miles (about 15 minutes).
    nonisolated static var walkableMiles: Double { 0.75 }

    init(
        loader: MapContentLoading = LiveMapContentLoader(),
        location: MapLocationProviding? = nil,
        now: @escaping () -> Date = { Date() }
    ) {
        self.loader = loader
        self.location = location ?? LocationService.shared
        self.now = now
    }

    // MARK: - Load Data

    /// First appearance loads; later appearances only refresh stale data and
    /// never move the camera or drop a search (IOS-DD-MAP-04). This used to be
    /// a full reload in `.task`, so popping a detail view or switching tabs
    /// recentred the map and replaced "jazz" results with nearby ones while
    /// the field still said "jazz".
    func loadIfNeeded() async {
        guard hasLoadedOnce else {
            // A first load still waiting on the permission prompt (up to 8 s)
            // is not restarted by a tab switch; run() would cancel it and ask
            // again from the top.
            if !isLoading { await loadNearbyContent() }
            return
        }
        await refreshIfStale()
    }

    /// Reloads the last area when its data is more than `staleAfter` old (or
    /// never loaded), unless a search is showing.
    func refreshIfStale() async {
        guard hasLoadedOnce, activeQuery == nil, !isLoading else { return }
        if let last = lastLoadedAt, now().timeIntervalSince(last) <= Self.staleAfter { return }
        await reloadCurrentArea()
    }

    /// The app came back to the foreground: drop a time chip whose hour has
    /// passed, re-evaluate the rest against the clock, refresh stale data.
    func sceneBecameActive() async {
        if MapTimeChip.available(now: now()).contains(timeChip) {
            refreshEventAnnotations()
            refreshRestaurantAnnotations()
        } else {
            timeChip = .anytime
        }
        await refreshIfStale()
    }

    func loadNearbyContent() async {
        // Run as the single cancellable fetch so a later search() (or reload)
        // cancels this load instead of letting it finish and clobber newer
        // results.
        await run { await self.performNearbyLoad() }
    }

    /// Location was just granted, or the user asked to go back to where they
    /// are: reload around them and recentre.
    func reloadNearMe() async {
        userMovedCamera = false
        await loadNearbyContent()
    }

    private func performNearbyLoad() async {
        isLoading = true
        needsZoomIn = false
        activeQuery = nil
        searchResultsOutsideArea = 0

        let center = await resolveOrigin()
        guard !Task.isCancelled else { return }
        currentLatitude = center.latitude
        currentLongitude = center.longitude
        radiusMiles = Config.defaultSearchRadiusMiles

        let region = MKCoordinateRegion(
            center: center,
            span: MKCoordinateSpan(latitudeDelta: 0.12, longitudeDelta: 0.12)
        )
        if !userMovedCamera {
            moveCamera(to: region)
        }

        await fetchAllContent(displayRegion: userMovedCamera ? (visibleRegion ?? region) : region)

        guard !Task.isCancelled else { return }
        isLoading = false
        hasLoadedOnce = true
    }

    /// Where to load around: the user's fix when allowed and in the metro,
    /// else downtown with a notice saying why.
    private func resolveOrigin() async -> CLLocationCoordinate2D {
        let downtown = CLLocationCoordinate2D(latitude: Config.defaultLatitude, longitude: Config.defaultLongitude)
        // In UI testing mode, skip location services entirely to avoid
        // permission dialogs and network delays on CI simulators.
        if Config.isUITesting { return downtown }

        let status = await location.awaitAuthorizationDecision(timeout: .seconds(8))
        if status == .denied || status == .restricted {
            setNotice(.denied)
            return downtown
        }
        guard LocationService.isAuthorized(status),
              let fix = try? await location.getCurrentLocation() else {
            // Undecided after the wait, or no fix: downtown, no notice.
            setNotice(LocationNotice.none)
            return downtown
        }
        let miles = Self.milesFromDowntown(fix.coordinate)
        if miles > Self.metroRadiusMiles {
            setNotice(.farAway(miles: Int(miles.rounded())))
            return downtown
        }
        setNotice(LocationNotice.none)
        return fix.coordinate
    }

    private func setNotice(_ notice: LocationNotice) {
        locationNotice = notice == dismissedNotice ? LocationNotice.none : notice
    }

    func dismissLocationNotice() {
        dismissedNotice = locationNotice
        locationNotice = .none
    }

    /// Loads the given visible region (IOS-DD-MAP-05, "Search this area").
    /// Never moves the camera.
    func loadRegion(_ region: MKCoordinateRegion) async {
        if region.span.latitudeDelta > 1.0 {
            fetchTask?.cancel()
            isLoading = false
            needsZoomIn = true
            return
        }
        currentLatitude = region.center.latitude
        currentLongitude = region.center.longitude
        radiusMiles = Self.radiusMiles(for: region)
        searchText = ""
        await run {
            self.isLoading = true
            self.needsZoomIn = false
            self.activeQuery = nil
            self.searchResultsOutsideArea = 0
            await self.fetchAllContent(displayRegion: region)
            guard !Task.isCancelled else { return }
            self.isLoading = false
            self.hasLoadedOnce = true
        }
    }

    /// Reloads the current centre and radius, keeping the camera.
    private func reloadCurrentArea() async {
        await run {
            self.isLoading = true
            await self.fetchAllContent(displayRegion: self.lastFetchRegion ?? self.visibleRegion)
            guard !Task.isCancelled else { return }
            self.isLoading = false
            self.hasLoadedOnce = true
        }
    }

    /// Fetch all content types concurrently so one failure doesn't block the
    /// others. Coordinates are coarsened before they leave the device
    /// (IOS-DD-MAP-15).
    private func fetchAllContent(displayRegion: MKCoordinateRegion?) async {
        let lat = LocationPrivacy.coarse(currentLatitude)
        let lng = LocationPrivacy.coarse(currentLongitude)
        let radius = radiusMiles
        let until = now().addingTimeInterval(Self.eventHorizon)
        let loader = self.loader

        async let fetchedEvents = Self.capture {
            try await loader.nearbyEvents(lat: lat, lng: lng, radiusMiles: radius, until: until)
        }
        async let fetchedRestaurants = Self.capture {
            try await loader.nearbyRestaurants(lat: lat, lng: lng, radiusMiles: radius)
        }
        async let fetchedAttractions = Self.capture {
            try await loader.nearbyAttractions(lat: lat, lng: lng, radiusMiles: radius)
        }

        let (e, r, a) = await (fetchedEvents, fetchedRestaurants, fetchedAttractions)
        // Don't let a superseded nearby/default load overwrite newer results
        // (e.g. a search the user kicked off while this was in flight).
        guard !Task.isCancelled else { return }
        apply(events: e, restaurants: r, attractions: a, clearFailed: false)
        if let displayRegion { lastFetchRegion = displayRegion }
    }

    /// Applies each successful kind. A failed kind keeps its previous rows
    /// (`clearFailed == false`) so one bad request does not wipe the map
    /// (IOS-DD-MAP-10); when everything failed nothing is touched at all.
    private func apply(
        events e: Result<[Event], Error>,
        restaurants r: Result<[Restaurant], Error>,
        attractions a: Result<[Attraction], Error>,
        clearFailed: Bool
    ) {
        var failed = Set<MapCluster.Kind>()
        switch e {
        case .success(let rows): events = rows
        case .failure: failed.insert(.event)
        }
        switch r {
        case .success(let rows): restaurants = rows
        case .failure: failed.insert(.restaurant)
        }
        switch a {
        case .success(let rows): attractions = rows
        case .failure: failed.insert(.attraction)
        }
        let allFailed = failed.count == MapCluster.Kind.allCases.count
        if clearFailed && !allFailed {
            if failed.contains(.event) { events = [] }
            if failed.contains(.restaurant) { restaurants = [] }
            if failed.contains(.attraction) { attractions = [] }
        }
        failedKinds = failed
        if !allFailed { lastLoadedAt = now() }
    }

    nonisolated static func capture<T>(_ operation: () async throws -> T) async -> Result<T, Error> {
        do {
            return .success(try await operation())
        } catch {
            return .failure(error)
        }
    }

    // MARK: - Search

    func search() async {
        let query = Self.normalizedQuery(searchText)
        guard !query.isEmpty else {
            // Clear search: reload content for the current area as a fresh
            // cancellable task so it can't race a subsequent search.
            activeQuery = nil
            searchResultsOutsideArea = 0
            await reloadCurrentArea()
            return
        }

        // Cancel any in-flight search/nearby fetch and run this one as the new
        // cancellable task, so a slow earlier search cannot overwrite newer
        // results.
        await run { await self.performSearch(query: query) }
    }

    func clearSearch() async {
        searchText = ""
        await search()
    }

    /// Trimmed and capped at 100 characters before it reaches a service
    /// (IOS-DD-MAP-11).
    nonisolated static func normalizedQuery(_ text: String) -> String {
        String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(100))
    }

    private func performSearch(query: String) async {
        isLoading = true
        needsZoomIn = false
        activeQuery = query
        clearSelection()

        // The three searches run together, as fetchAllContent does; they
        // used to run one after another (IOS-DD-MAP-10).
        let loader = self.loader
        async let fetchedEvents = Self.capture { try await loader.searchEvents(query) }
        async let fetchedRestaurants = Self.capture { try await loader.searchRestaurants(query) }
        async let fetchedAttractions = Self.capture { try await loader.searchAttractions(query) }
        let (e, r, a) = await (fetchedEvents, fetchedRestaurants, fetchedAttractions)
        // Don't let a superseded search overwrite newer results.
        guard !Task.isCancelled else { return }

        // A failed kind is emptied rather than kept: nearby rows left under a
        // search would read as matches.
        apply(events: e, restaurants: r, attractions: a, clearFailed: true)
        guard failedKinds.count < MapCluster.Kind.allCases.count else {
            // Offline: the earlier pins stay and the camera stays with them.
            isLoading = false
            hasLoadedOnce = true
            return
        }

        // Fit the camera to results in the metro only. fuzzy_search_* has no
        // geographic bound, and one (0,0) row used to fit the camera to the
        // Atlantic (IOS-DD-MAP-11).
        let allCoords = events.compactMap(\.coordinate)
            + restaurants.compactMap(\.coordinate)
            + attractions.compactMap(\.coordinate)
        let (inArea, outside) = Self.partitionForFit(allCoords)
        searchResultsOutsideArea = outside
        if let region = await Self.regionFitting(coordinates: inArea) {
            guard !Task.isCancelled else { return }
            moveCamera(to: region)
            lastFetchRegion = region
        }

        isLoading = false
        hasLoadedOnce = true
    }

    /// Coordinates to fit a search camera to (plausible and within
    /// `metroRadiusMiles` of downtown), and how many were left out.
    nonisolated static func partitionForFit(_ coordinates: [CLLocationCoordinate2D]) -> (inArea: [CLLocationCoordinate2D], outside: Int) {
        var inArea: [CLLocationCoordinate2D] = []
        for c in coordinates where GeoBoundingBox.isPlausibleMapCoordinate(c) && milesFromDowntown(c) <= metroRadiusMiles {
            inArea.append(c)
        }
        return (inArea, coordinates.count - inArea.count)
    }

    // MARK: - Retry

    /// Repeats what failed: the search if one is showing, else the area.
    func retry() async {
        if let query = activeQuery {
            await run { await self.performSearch(query: query) }
        } else if hasLoadedOnce {
            await reloadCurrentArea()
        } else {
            await loadNearbyContent()
        }
    }

    private func run(_ operation: @escaping @MainActor () async -> Void) async {
        fetchTask?.cancel()
        let task = Task { await operation() }
        fetchTask = task
        await task.value
    }

    // MARK: - Camera

    /// Moves the camera on the view model's behalf, so the resulting camera
    /// callback is not mistaken for the user panning.
    func moveCamera(to region: MKCoordinateRegion) {
        isProgrammaticCameraMove = true
        cameraPosition = .region(region)
    }

    /// Called by the view at the end of every camera change.
    func cameraDidChange(to region: MKCoordinateRegion) {
        visibleRegion = region
        if isProgrammaticCameraMove {
            isProgrammaticCameraMove = false
            return
        }
        if hasLoadedOnce { userMovedCamera = true }
    }

    /// Whether to offer "Search this area" for the visible region.
    func shouldOfferSearchThisArea(for region: MKCoordinateRegion) -> Bool {
        guard let lastFetchRegion else { return false }
        return Self.shouldOfferSearchThisArea(current: region, last: lastFetchRegion)
    }

    /// True when the centre moved more than 30% of the last span on either
    /// axis, or the zoom changed by 2x either way.
    nonisolated static func shouldOfferSearchThisArea(current: MKCoordinateRegion, last: MKCoordinateRegion) -> Bool {
        let lastLat = max(last.span.latitudeDelta, 1e-6)
        let lastLng = max(last.span.longitudeDelta, 1e-6)
        let movedLat = abs(current.center.latitude - last.center.latitude) > 0.3 * lastLat
        let movedLng = abs(current.center.longitude - last.center.longitude) > 0.3 * lastLng
        let ratio = current.span.latitudeDelta / lastLat
        return movedLat || movedLng || ratio >= 2 || ratio <= 0.5
    }

    /// Radius that covers the visible region: half the height plus 20%,
    /// between 1 and 30 miles.
    nonisolated static func radiusMiles(for region: MKCoordinateRegion) -> Double {
        min(max(region.span.latitudeDelta * 69.0 / 2.0 * 1.2, 1), 30)
    }

    nonisolated static func milesFromDowntown(_ c: CLLocationCoordinate2D) -> Double {
        let downtown = CLLocation(latitude: Config.defaultLatitude, longitude: Config.defaultLongitude)
        return downtown.distance(from: CLLocation(latitude: c.latitude, longitude: c.longitude)) * 0.000621371
    }

    // MARK: - Clear Selection

    func clearSelection() {
        selectedEvent = nil
        selectedRestaurant = nil
        selectedAttraction = nil
    }

    func select(_ destination: MapDestination) {
        clearSelection()
        switch destination {
        case .event(let e): selectedEvent = e
        case .restaurant(let r): selectedRestaurant = r
        case .attraction(let a): selectedAttraction = a
        }
    }

    var selectedDestination: MapDestination? {
        if let selectedEvent { return .event(selectedEvent) }
        if let selectedRestaurant { return .restaurant(selectedRestaurant) }
        if let selectedAttraction { return .attraction(selectedAttraction) }
        return nil
    }

    // MARK: - Location capabilities

    var canUseWalkable: Bool { LocationService.isAuthorized(location.authorizationStatus) }
    var showsWalkable: Bool { location.accuracyAuthorization != .reducedAccuracy }

    func distanceText(to coordinate: CLLocationCoordinate2D) -> String? {
        location.formattedDistance(from: coordinate)
    }

    // MARK: - Annotation Refresh

    private func refreshAllAnnotations() {
        refreshEventAnnotations()
        refreshRestaurantAnnotations()
        refreshAttractionAnnotations()
    }

    private func refreshEventAnnotations() {
        let current = now()
        let pinnable = events.compactMap { event -> (Event, CLLocationCoordinate2D)? in
            guard let coord = event.coordinate, GeoBoundingBox.isPlausibleMapCoordinate(coord) else { return nil }
            return (event, coord)
        }
        rawCounts[.event] = pinnable.count
        var out: [EventAnnotation] = []
        if showEvents {
            let window = timeChip.window(now: current)
            for (event, coord) in pinnable {
                guard Self.eventMatches(event, window: window, openNowOnly: openNowOnly, now: current) else { continue }
                if walkableOnly && !Self.isWalkable(location.distance(from: coord)) { continue }
                out.append(EventAnnotation(event: event, coordinate: coord, now: current))
            }
        }
        eventAnnotations = out
        eventIndex = Dictionary(out.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        annotationsVersion += 1
    }

    private func refreshRestaurantAnnotations() {
        let current = now()
        let pinnable = restaurants.compactMap { restaurant -> (Restaurant, CLLocationCoordinate2D)? in
            guard let coord = restaurant.coordinate, GeoBoundingBox.isPlausibleMapCoordinate(coord),
                  restaurant.lifecycle != .closedPermanently else { return nil }
            return (restaurant, coord)
        }
        rawCounts[.restaurant] = pinnable.count
        var out: [RestaurantAnnotation] = []
        var hiddenUnknown = 0
        if showRestaurants {
            let probe = timeChip.probeTime(now: current)
            for (restaurant, coord) in pinnable {
                if let probe, !Self.restaurantMatches(restaurant, at: probe) {
                    if restaurant.isOpenNow(at: probe) == nil { hiddenUnknown += 1 }
                    continue
                }
                if openNowOnly, !Self.restaurantMatches(restaurant, at: current) {
                    if probe == nil, restaurant.isOpenNow(at: current) == nil { hiddenUnknown += 1 }
                    continue
                }
                if walkableOnly && !Self.isWalkable(location.distance(from: coord)) { continue }
                out.append(RestaurantAnnotation(restaurant: restaurant, coordinate: coord))
            }
        }
        restaurantAnnotations = out
        restaurantsHiddenUnknownHours = hiddenUnknown
        restaurantIndex = Dictionary(out.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        annotationsVersion += 1
    }

    private func refreshAttractionAnnotations() {
        let pinnable = attractions.compactMap { attraction -> (Attraction, CLLocationCoordinate2D)? in
            guard let coord = attraction.coordinate, GeoBoundingBox.isPlausibleMapCoordinate(coord) else { return nil }
            return (attraction, coord)
        }
        rawCounts[.attraction] = pinnable.count
        var out: [AttractionAnnotation] = []
        if showAttractions {
            for (attraction, coord) in pinnable {
                if walkableOnly && !Self.isWalkable(location.distance(from: coord)) { continue }
                out.append(AttractionAnnotation(attraction: attraction, coordinate: coord))
            }
        }
        attractionAnnotations = out
        attractionIndex = Dictionary(out.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        annotationsVersion += 1
    }

    // MARK: - Filter rules (pure, tested)

    /// Whether a restaurant gets a pin when the map asks about `time`.
    /// Permanently closed never does. With a time set, only a restaurant whose
    /// hours say it is open then; unknown hours no longer count as open
    /// (IOS-DD-MAP-02: `isOpenNow ?? true` made every row "open").
    nonisolated static func restaurantMatches(_ restaurant: Restaurant, at time: Date?) -> Bool {
        if restaurant.lifecycle == .closedPermanently { return false }
        guard let time else { return true }
        return restaurant.isOpenNow(at: time) == true
    }

    nonisolated static func eventMatches(_ event: Event, window: DateInterval?, openNowOnly: Bool, now: Date) -> Bool {
        if let window, !MapTimeChip.eventMatches(event, window: window) { return false }
        if openNowOnly, !event.happeningNow(at: now) { return false }
        return true
    }

    nonisolated static func isWalkable(_ distanceMiles: Double?) -> Bool {
        guard let distanceMiles else { return false }
        return distanceMiles <= walkableMiles
    }

    var totalPinCount: Int {
        eventAnnotations.count + restaurantAnnotations.count + attractionAnnotations.count
    }

    var enabledKinds: Set<MapCluster.Kind> {
        var kinds = Set<MapCluster.Kind>()
        if showEvents { kinds.insert(.event) }
        if showRestaurants { kinds.insert(.restaurant) }
        if showAttractions { kinds.insert(.attraction) }
        return kinds
    }

    /// Changes whenever a filter does; the view announces the new count.
    var filterSignature: String {
        "\(showEvents)\(showRestaurants)\(showAttractions)\(openNowOnly)\(walkableOnly)\(timeChip.rawValue)"
    }

    // MARK: - Overlay (IOS-DD-MAP-10)

    var overlay: MapOverlayState {
        guard hasLoadedOnce else { return .none }
        return Self.resolveOverlay(
            failedKinds: failedKinds,
            rawCounts: rawCounts,
            visibleCount: totalPinCount,
            timeChip: timeChip,
            quickFiltersOn: openNowOnly || walkableOnly,
            enabledKinds: enabledKinds,
            isSearch: activeQuery != nil,
            query: activeQuery ?? "",
            needsZoomIn: needsZoomIn
        )
    }

    /// One state for the map's message. Offline only when every kind failed;
    /// "filtered out" when rows loaded but the filters hide all of them, which
    /// used to leave a blank map with no explanation.
    nonisolated static func resolveOverlay(
        failedKinds: Set<MapCluster.Kind>,
        rawCounts: [MapCluster.Kind: Int],
        visibleCount: Int,
        timeChip: MapTimeChip,
        quickFiltersOn: Bool,
        enabledKinds: Set<MapCluster.Kind>,
        isSearch: Bool,
        query: String,
        needsZoomIn: Bool
    ) -> MapOverlayState {
        if needsZoomIn { return .zoomIn }
        if failedKinds.count == MapCluster.Kind.allCases.count { return .offline }
        let rawTotal = rawCounts.values.reduce(0, +)
        if rawTotal == 0 {
            if !failedKinds.isEmpty { return .partial(failedKinds: failedKinds) }
            return isSearch ? .noResults(query: query) : .emptyArea
        }
        if visibleCount == 0 {
            let hiddenKinds = Set(rawCounts.filter { $0.value > 0 && !enabledKinds.contains($0.key) }.keys)
            return .filteredOut(
                hiddenByTime: timeChip != .anytime,
                hiddenByQuickFilters: quickFiltersOn,
                hiddenKinds: hiddenKinds
            )
        }
        if !failedKinds.isEmpty { return .partial(failedKinds: failedKinds) }
        return .none
    }

    // MARK: - Clustering

    /// Every drawn annotation as a clustering input (IOS-DD-MAP-08).
    var clusterPoints: [MapClustering.Point] {
        eventAnnotations.map { .init(id: $0.id, coordinate: $0.coordinate, kind: .event) }
            + restaurantAnnotations.map { .init(id: $0.id, coordinate: $0.coordinate, kind: .restaurant) }
            + attractionAnnotations.map { .init(id: $0.id, coordinate: $0.coordinate, kind: .attraction) }
    }

    /// Resolves a cluster's member ids back to their models so the UI can offer
    /// a disambiguation list when zooming can't separate co-located pins
    /// (IOS-AUDIT-UX-027).
    func members(in cluster: MapCluster) -> [MapMember] {
        cluster.memberIds.compactMap { id -> MapMember? in
            if let a = eventIndex[id] { return .event(a.event, a.coordinate) }
            if let a = restaurantIndex[id] { return .restaurant(a.restaurant, a.coordinate) }
            if let a = attractionIndex[id] { return .attraction(a.attraction, a.coordinate) }
            return nil
        }
    }

    // MARK: - List (IOS-DD-MAP-12)

    /// The drawn annotations as list rows, nearest first (by start time for
    /// Now and Tonight).
    var listItems: [MapListItem] {
        var items: [MapListItem] = []
        for a in eventAnnotations {
            items.append(MapListItem(
                id: "event-\(a.id)", destination: .event(a.event), title: a.event.title,
                cardData: a.event.cardData, distanceMiles: location.distance(from: a.coordinate),
                distanceText: location.formattedDistance(from: a.coordinate), start: a.event.parsedDate
            ))
        }
        for a in restaurantAnnotations {
            items.append(MapListItem(
                id: "restaurant-\(a.id)", destination: .restaurant(a.restaurant), title: a.restaurant.name,
                cardData: a.restaurant.cardData, distanceMiles: location.distance(from: a.coordinate),
                distanceText: location.formattedDistance(from: a.coordinate), start: nil
            ))
        }
        for a in attractionAnnotations {
            items.append(MapListItem(
                id: "attraction-\(a.id)", destination: .attraction(a.attraction), title: a.attraction.name,
                cardData: a.attraction.cardData, distanceMiles: location.distance(from: a.coordinate),
                distanceText: location.formattedDistance(from: a.coordinate), start: nil
            ))
        }
        return Self.sortListItems(items, chip: timeChip)
    }

    nonisolated static func sortListItems(_ items: [MapListItem], chip: MapTimeChip) -> [MapListItem] {
        let byStart = chip == .now || chip == .tonight
        return items.sorted { a, b in
            if byStart, let order = ascendingNilsLast(a.start, b.start) { return order }
            if let order = ascendingNilsLast(a.distanceMiles, b.distanceMiles) { return order }
            return a.id < b.id
        }
    }

    /// `a < b` with nil after any value; nil when the two tie.
    private nonisolated static func ascendingNilsLast<T: Comparable>(_ a: T?, _ b: T?) -> Bool? {
        switch (a, b) {
        case let (x?, y?): return x == y ? nil : x < y
        case (.some, .none): return true
        case (.none, .some): return false
        case (.none, .none): return nil
        }
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

// MARK: - States

enum LocationNotice: Equatable {
    case none
    case denied
    case farAway(miles: Int)
}

enum MapOverlayState: Equatable {
    case none
    case offline
    case partial(failedKinds: Set<MapCluster.Kind>)
    case emptyArea
    case noResults(query: String)
    case filteredOut(hiddenByTime: Bool, hiddenByQuickFilters: Bool, hiddenKinds: Set<MapCluster.Kind>)
    case zoomIn
}

// MARK: - List row

struct MapListItem: Identifiable {
    let id: String
    let destination: MapDestination
    let title: String
    let cardData: ContentCardData
    let distanceMiles: Double?
    let distanceText: String?
    /// Events only: the start, for the Now and Tonight ordering.
    let start: Date?

    /// Card label plus distance and sponsorship, for the list row.
    var accessibilityLabel: String {
        var parts = [cardData.accessibilityLabel.isEmpty ? title : cardData.accessibilityLabel]
        if let distanceText { parts.append(distanceText) }
        if cardData.isSponsored { parts.append("Sponsored") }
        return parts.joined(separator: ", ")
    }
}

// MARK: - Annotation Models

struct EventAnnotation: Identifiable {
    let event: Event
    let coordinate: CLLocationCoordinate2D
    /// On now or starting later today in Des Moines: the pin gets a ring.
    let isTonight: Bool
    var id: String { event.id }

    init(event: Event, coordinate: CLLocationCoordinate2D, now: Date = Date()) {
        self.event = event
        self.coordinate = coordinate
        self.isTonight = Self.isTonight(event, now: now)
    }

    /// Happening now, or starting later on the same Central day
    /// (IOS-DD-MAP-13). Replaces the unused device-zone `tintColor`.
    static func isTonight(_ event: Event, now: Date, calendar: Calendar = DesMoinesTime.calendar) -> Bool {
        if event.happeningNow(at: now) { return true }
        guard let start = event.parsedDate, start >= now else { return false }
        return calendar.isDate(start, inSameDayAs: now)
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

/// A single resolved member of a `MapCluster`, used by the disambiguation sheet
/// so co-located pins remain selectable (IOS-AUDIT-UX-027).
enum MapMember: Identifiable {
    case event(Event, CLLocationCoordinate2D)
    case restaurant(Restaurant, CLLocationCoordinate2D)
    case attraction(Attraction, CLLocationCoordinate2D)

    var id: String {
        switch self {
        case .event(let e, _): return "event-\(e.id)"
        case .restaurant(let r, _): return "restaurant-\(r.id)"
        case .attraction(let a, _): return "attraction-\(a.id)"
        }
    }

    var title: String {
        switch self {
        case .event(let e, _): return e.title
        case .restaurant(let r, _): return r.name
        case .attraction(let a, _): return a.name
        }
    }

    var icon: String {
        switch self {
        case .event(let e, _): return e.eventCategory.icon
        case .restaurant: return "fork.knife"
        case .attraction(let a, _): return a.attractionType.icon
        }
    }

    var tint: Color {
        switch self {
        case .event: return MapPalette.event
        case .restaurant: return MapPalette.restaurant
        case .attraction: return MapPalette.attraction
        }
    }

    var coordinate: CLLocationCoordinate2D {
        switch self {
        case .event(_, let c), .restaurant(_, let c), .attraction(_, let c): return c
        }
    }

    var destination: MapDestination {
        switch self {
        case .event(let e, _): return .event(e)
        case .restaurant(let r, _): return .restaurant(r)
        case .attraction(let a, _): return .attraction(a)
        }
    }
}
