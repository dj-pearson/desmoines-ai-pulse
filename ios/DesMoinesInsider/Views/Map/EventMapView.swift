import SwiftUI
import MapKit

/// Map view showing nearby events, restaurants, and attractions with color-coded pins
/// and search functionality, plus a list alternative (IOS-DD-MAP-12).
struct EventMapView: View {
    enum DisplayMode: String, CaseIterable, Identifiable {
        case map = "Map"
        case list = "List"
        var id: String { rawValue }
    }

    @State private var viewModel = MapViewModel()
    @State private var locationService = LocationService.shared
    @State private var navigationPath = NavigationPath()
    @State private var mode: DisplayMode = .map
    @State private var didPickInitialMode = false
    /// Cluster whose members are being disambiguated in a sheet (IOS-AUDIT-UX-027).
    @State private var disambiguationCluster: MapCluster?
    @State private var currentRegion = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: Config.defaultLatitude, longitude: Config.defaultLongitude),
        span: MKCoordinateSpan(latitudeDelta: 0.15, longitudeDelta: 0.15)
    )
    /// What the map draws, computed off the render path (IOS-AUDIT-PERF-014).
    /// Recomputed when the annotations change, the zoom level changes, or the
    /// centre moves more than half a screen (only pins near the screen are
    /// drawn now, IOS-DD-MAP-08) - never per camera frame.
    @State private var renderItems: [MapPinItem] = []
    @State private var lastZoomBucket: Int = .min
    @State private var lastRenderCenter: CLLocationCoordinate2D?

    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        NavigationStack(path: $navigationPath) {
            screen
                .navigationTitle("Explore")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { modeToolbar }
                .navigationDestination(for: Event.self) { event in
                    EventDetailView(event: event)
                }
                .navigationDestination(for: MapDestination.self) { destination in
                    destinationView(destination)
                }
                .modifier(lifecycle)
        }
    }

    // MARK: - Screen

    private var screen: some View {
        ZStack {
            if mode == .map {
                mapContent
            } else {
                MapListView(viewModel: viewModel)
            }
            if !viewModel.isLoading {
                MapOverlayView(viewModel: viewModel) {
                    Task { await viewModel.loadRegion(currentRegion) }
                }
            }
        }
        .safeAreaInset(edge: .top) { topControls }
        .safeAreaInset(edge: .bottom) { bottomControls }
    }

    private var lifecycle: MapLifecycleModifier {
        MapLifecycleModifier(
            viewModel: viewModel,
            authorizationStatus: locationService.authorizationStatus,
            scenePhase: scenePhase,
            onFirstAppear: pickInitialMode
        )
    }

    /// List by default under VoiceOver, once, at first appearance.
    private func pickInitialMode() {
        guard !didPickInitialMode else { return }
        didPickInitialMode = true
        if UIAccessibility.isVoiceOverRunning { mode = .list }
    }

    @ToolbarContentBuilder
    private var modeToolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Picker("View as", selection: $mode) {
                ForEach(DisplayMode.allCases) { m in
                    Text(m.rawValue).tag(m)
                }
            }
            .pickerStyle(.segmented)
            .fixedSize()
        }
    }

    @ViewBuilder
    private func destinationView(_ destination: MapDestination) -> some View {
        switch destination {
        case .event(let event): EventDetailView(event: event)
        case .restaurant(let restaurant): RestaurantDetailView(restaurant: restaurant)
        case .attraction(let attraction): AttractionDetailView(attraction: attraction)
        }
    }

    // MARK: - Top and bottom controls

    private var topControls: some View {
        VStack(spacing: 8) {
            searchBar
                .padding(.horizontal)
            MapFilterChips(viewModel: viewModel)
            locationNoticeChip
            if offersSearchThisArea {
                searchThisAreaButton
            }
        }
        .padding(.top, 8)
        .padding(.bottom, 4)
    }

    private var offersSearchThisArea: Bool {
        mode == .map
            && viewModel.searchText.isEmpty
            && viewModel.activeQuery == nil
            && !viewModel.isLoading
            && viewModel.shouldOfferSearchThisArea(for: currentRegion)
    }

    private var searchThisAreaButton: some View {
        Button {
            Task { await viewModel.loadRegion(currentRegion) }
        } label: {
            Label("Search this area", systemImage: "magnifyingglass")
                .font(.footnote.weight(.semibold))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(.regularMaterial, in: Capsule())
        }
        .buttonStyle(.plain)
        .minHitTarget()
    }

    @ViewBuilder
    private var locationNoticeChip: some View {
        switch viewModel.locationNotice {
        case .none:
            EmptyView()
        case .denied:
            noticeChip("Showing downtown Des Moines. Turn on location") {
                if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
            }
        case .farAway(let miles):
            noticeChip("You're \(miles) mi from Des Moines. Showing downtown.", action: nil)
        }
    }

    private func noticeChip(_ text: String, action: (() -> Void)?) -> some View {
        HStack(spacing: 4) {
            if let action {
                Button(text, action: action)
                    .font(.caption.weight(.semibold))
                    .accessibilityHint("Opens Settings")
            } else {
                Text(text).font(.caption.weight(.semibold))
            }
            Button {
                viewModel.dismissLocationNotice()
            } label: {
                Image(systemName: "xmark")
                    .font(.caption2.weight(.bold))
            }
            .minHitTarget()
            .accessibilityLabel("Dismiss")
        }
        .padding(.leading, 12)
        .glassChip(cornerRadius: 999, material: .regularMaterial)
        .padding(.horizontal)
    }

    private var bottomControls: some View {
        VStack(spacing: 8) {
            statusRow
            if let destination = viewModel.selectedDestination, mode == .map {
                MapPlacePopup(
                    model: .make(for: destination, distanceText: destination.coordinate.flatMap { viewModel.distanceText(to: $0) }),
                    onOpen: { navigationPath.append(destination) },
                    onClose: { viewModel.clearSelection() }
                )
            } else {
                // Hidden while a popup shows, otherwise the slider would crowd it.
                MapTimeSlider(
                    chip: $viewModel.timeChip,
                    eventCount: viewModel.eventAnnotations.count,
                    restaurantOpenCount: viewModel.restaurantAnnotations.count,
                    restaurantUnknownCount: viewModel.restaurantsHiddenUnknownHours
                )
                .padding(.horizontal)
                .padding(.bottom, 4)
            }
        }
    }

    @ViewBuilder
    private var statusRow: some View {
        if viewModel.isLoading {
            loadingOverlay
        } else if case .partial(let failed) = viewModel.overlay {
            retryChip(Self.failedText(failed))
        } else if viewModel.overlay == .offline && viewModel.totalPinCount > 0 {
            retryChip("Offline. Showing earlier results")
        } else if viewModel.totalPinCount > 0 && mode == .map {
            pinCountBadge
        }
    }

    static func failedText(_ kinds: Set<MapCluster.Kind>) -> String {
        let names = MapCluster.Kind.allCases.filter { kinds.contains($0) }.map { kind -> String in
            switch kind {
            case .event: return "Events"
            case .restaurant: return "Dining"
            case .attraction: return "Places"
            }
        }
        return names.joined(separator: " and ") + " couldn't load"
    }

    private func retryChip(_ text: String) -> some View {
        Button {
            Task { await viewModel.retry() }
        } label: {
            Text("\(text) · Retry")
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .glassChip(cornerRadius: 999, material: .regularMaterial)
        }
        .buttonStyle(.plain)
        .minHitTarget()
    }

    // MARK: - Map Content

    private var mapContent: some View {
        Map(position: $viewModel.cameraPosition) {
            UserAnnotation()
            ForEach(renderItems) { item in
                mapItem(item)
            }
        }
        .mapStyle(.standard(elevation: .realistic))
        .mapControls {
            MapUserLocationButton()
            MapCompass()
            MapScaleView()
        }
        .onMapCameraChange(frequency: .onEnd) { context in
            currentRegion = context.region
            viewModel.cameraDidChange(to: context.region)
            refreshRenderItems(force: false)
        }
        .onChange(of: viewModel.annotationsVersion) { _, _ in
            refreshRenderItems(force: true)
        }
        .onAppear { refreshRenderItems(force: true) }
        .sheet(item: $disambiguationCluster) { cluster in
            ClusterDisambiguationSheet(members: viewModel.members(in: cluster)) { member in
                select(member)
            }
            .presentationDetents([.medium, .large])
        }
    }

    @MapContentBuilder
    private func mapItem(_ item: MapPinItem) -> some MapContent {
        switch item {
        case .event(let annotation):
            Annotation(annotation.event.title, coordinate: annotation.coordinate) {
                eventPin(annotation)
            }
        case .restaurant(let annotation):
            Annotation(annotation.restaurant.name, coordinate: annotation.coordinate) {
                restaurantPin(annotation)
            }
        case .attraction(let annotation):
            Annotation(annotation.attraction.name, coordinate: annotation.coordinate) {
                attractionPin(annotation)
            }
        case .cluster(let cluster):
            Annotation("\(cluster.count) places", coordinate: cluster.coordinate) {
                clusterButton(cluster)
            }
        }
    }

    private func eventPin(_ annotation: EventAnnotation) -> some View {
        let isSelected = viewModel.selectedEvent?.id == annotation.id
        return Button {
            viewModel.select(.event(annotation.event))
        } label: {
            EventMapPin(category: annotation.event.eventCategory, isSelected: isSelected, isTonight: annotation.isTonight)
        }
        .accessibilityLabel(MapPinLabel.event(annotation.event, distance: viewModel.distanceText(to: annotation.coordinate)))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityHint("Shows details below the map")
    }

    private func restaurantPin(_ annotation: RestaurantAnnotation) -> some View {
        let isSelected = viewModel.selectedRestaurant?.id == annotation.id
        return Button {
            viewModel.select(.restaurant(annotation.restaurant))
        } label: {
            RestaurantMapPin(isSelected: isSelected)
        }
        .accessibilityLabel(MapPinLabel.restaurant(annotation.restaurant, distance: viewModel.distanceText(to: annotation.coordinate)))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityHint("Shows details below the map")
    }

    private func attractionPin(_ annotation: AttractionAnnotation) -> some View {
        let isSelected = viewModel.selectedAttraction?.id == annotation.id
        return Button {
            viewModel.select(.attraction(annotation.attraction))
        } label: {
            AttractionMapPin(type: annotation.attraction.attractionType, isSelected: isSelected)
        }
        .accessibilityLabel(MapPinLabel.attraction(annotation.attraction, distance: viewModel.distanceText(to: annotation.coordinate)))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityHint("Shows details below the map")
    }

    private func clusterButton(_ cluster: MapCluster) -> some View {
        Button {
            // List the members when the bubble is small, the map is already
            // zoomed in, or they share one spot (zoom can never split those);
            // otherwise zoom to break it up (IOS-DD-MAP-08).
            if MapClustering.shouldListMembers(cluster, latitudeSpan: currentRegion.span.latitudeDelta) {
                disambiguationCluster = cluster
            } else {
                zoomTo(cluster: cluster)
            }
        } label: {
            ClusterMapPin(count: cluster.count, tint: cluster.tintColor)
        }
        .accessibilityLabel(cluster.accessibilityLabel)
    }

    /// Zoom into a cluster - divides the visible span so the pins separate out.
    private func zoomTo(cluster: MapCluster) {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        let newSpan = MKCoordinateSpan(
            latitudeDelta: max(currentRegion.span.latitudeDelta / 2.5, MapClustering.minimumZoomSpan),
            longitudeDelta: max(currentRegion.span.longitudeDelta / 2.5, MapClustering.minimumZoomSpan)
        )
        withAnimation(reduceMotion ? nil : .default) {
            viewModel.cameraPosition = .region(MKCoordinateRegion(center: cluster.coordinate, span: newSpan))
        }
    }

    /// A sheet pick selects the member and centres on it.
    private func select(_ member: MapMember) {
        viewModel.select(member.destination)
        let span = min(currentRegion.span.latitudeDelta, 0.01)
        withAnimation(reduceMotion ? nil : .default) {
            viewModel.cameraPosition = .region(MKCoordinateRegion(
                center: member.coordinate,
                span: MKCoordinateSpan(latitudeDelta: span, longitudeDelta: span)
            ))
        }
        disambiguationCluster = nil
    }

    private func refreshRenderItems(force: Bool) {
        // Quantize zoom to an integer level so small zooms are a no-op.
        let delta = max(currentRegion.span.latitudeDelta, 0.0001)
        let bucket = Int((log2(1.0 / delta)).rounded())
        var movedFar = true
        if let last = lastRenderCenter {
            movedFar = abs(last.latitude - currentRegion.center.latitude) > currentRegion.span.latitudeDelta * 0.5
                || abs(last.longitude - currentRegion.center.longitude) > currentRegion.span.longitudeDelta * 0.5
        }
        guard force || bucket != lastZoomBucket || movedFar else { return }
        lastZoomBucket = bucket
        lastRenderCenter = currentRegion.center
        renderItems = MapClustering.items(viewModel.clusterPoints, region: currentRegion).compactMap { item -> MapPinItem? in
            switch item {
            case .cluster(let cluster):
                return .cluster(cluster)
            case .single(let id, let kind, _):
                switch kind {
                case .event: return viewModel.eventIndex[id].map(MapPinItem.event)
                case .restaurant: return viewModel.restaurantIndex[id].map(MapPinItem.restaurant)
                case .attraction: return viewModel.attractionIndex[id].map(MapPinItem.attraction)
                }
            }
        }
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
                .font(.subheadline)
                .accessibilityHidden(true)

            TextField("Search events, dining, attractions...", text: $viewModel.searchText)
                .textFieldStyle(.plain)
                .font(.subheadline)
                .submitLabel(.search)
                .onSubmit {
                    Task { await viewModel.search() }
                }

            if !viewModel.searchText.isEmpty {
                Button {
                    Task { await viewModel.clearSearch() }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                        .font(.subheadline)
                }
                .minHitTarget()
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .glassBar(cornerRadius: PremiumTokens.cornerMd, material: .ultraThickMaterial, elevation: PremiumTokens.elevation4)
    }

    // MARK: - Pin Count Badge

    private var pinCountBadge: some View {
        HStack(spacing: 6) {
            Image(systemName: "mappin.circle.fill")
                .font(.caption)
                .accessibilityHidden(true)
            Text("^[\(viewModel.totalPinCount) place](inflect: true)")
                .font(.caption2.weight(.semibold))
            if viewModel.searchResultsOutsideArea > 0 {
                Text("· \(viewModel.searchResultsOutsideArea) more results elsewhere")
                    .font(.caption2)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .glassChip(cornerRadius: 999, material: .ultraThinMaterial)
    }

    // MARK: - Loading

    private var loadingOverlay: some View {
        HStack(spacing: 8) {
            ProgressView()
            Text("Finding nearby places...")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial, in: Capsule())
        .padding(.bottom, 8)
    }
}

// MARK: - Render items resolved to annotations

/// A MapRenderItem with its annotation looked up, so the Map builder is a
/// plain switch with no optional lookups.
private enum MapPinItem: Identifiable {
    case event(EventAnnotation)
    case restaurant(RestaurantAnnotation)
    case attraction(AttractionAnnotation)
    case cluster(MapCluster)

    var id: String {
        switch self {
        case .event(let a): return "event-\(a.id)"
        case .restaurant(let a): return "restaurant-\(a.id)"
        case .attraction(let a): return "attraction-\(a.id)"
        case .cluster(let c): return "cluster-\(c.id)"
        }
    }
}

// MARK: - Lifecycle

/// Loading, foreground and permission hooks, split out of EventMapView.body
/// to keep that expression small.
private struct MapLifecycleModifier: ViewModifier {
    let viewModel: MapViewModel
    let authorizationStatus: CLAuthorizationStatus
    let scenePhase: ScenePhase
    let onFirstAppear: () -> Void

    func body(content: Content) -> some View {
        content
            // First appearance loads; later ones only refresh stale data
            // (IOS-DD-MAP-04).
            .task { await viewModel.loadIfNeeded() }
            .onAppear(perform: onFirstAppear)
            .onChange(of: scenePhase) { _, phase in
                if phase == .active {
                    Task { await viewModel.sceneBecameActive() }
                }
            }
            // "Allow" answered after the first load: reload around the user
            // (IOS-DD-MAP-06). Not while a search is showing, which the
            // nearby reload would replace under a field still holding the query.
            .onChange(of: authorizationStatus) { old, new in
                if viewModel.hasLoadedOnce, viewModel.activeQuery == nil,
                   !LocationService.isAuthorized(old), LocationService.isAuthorized(new) {
                    Task { await viewModel.reloadNearMe() }
                }
            }
            // One haptic and one VoiceOver count per filter change
            // (IOS-DD-MAP-13).
            .onChange(of: viewModel.filterSignature) { _, _ in
                UISelectionFeedbackGenerator().selectionChanged()
                AccessibilityNotification.Announcement("\(viewModel.totalPinCount) places shown").post()
            }
    }
}

// MARK: - Custom Map Pins

private struct EventMapPin: View {
    let category: EventCategory
    var isSelected: Bool = false
    /// On now or later today: white ring and a dot (IOS-DD-MAP-13). Static,
    /// so nothing moves under Reduce Motion.
    var isTonight: Bool = false
    // Drop the selection spring under Reduce Motion (IOS-AUDIT-UX-047).
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            Circle()
                .fill(MapPalette.event)
                .frame(width: isSelected ? 40 : 32, height: isSelected ? 40 : 32)
                .shadow(color: MapPalette.event.opacity(0.4), radius: isSelected ? 6 : 3)

            if isTonight {
                Circle()
                    .strokeBorder(Color.white, lineWidth: 2)
                    .frame(width: isSelected ? 40 : 32, height: isSelected ? 40 : 32)
            }

            Image(systemName: category.icon)
                .font(.system(size: isSelected ? 16 : 12, weight: .semibold))
                .foregroundStyle(.white)
        }
        .overlay(alignment: .topTrailing) {
            if isTonight {
                Circle()
                    .fill(Color.yellow)
                    .frame(width: 9, height: 9)
                    .overlay(Circle().strokeBorder(Color.white, lineWidth: 1.5))
            }
        }
        .animation(reduceMotion ? nil : .spring(response: 0.3), value: isSelected)
    }
}

private struct RestaurantMapPin: View {
    var isSelected: Bool = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            Circle()
                .fill(MapPalette.restaurant)
                .frame(width: isSelected ? 38 : 30, height: isSelected ? 38 : 30)
                .shadow(color: MapPalette.restaurant.opacity(0.4), radius: isSelected ? 6 : 3)

            Image(systemName: "fork.knife")
                .font(.system(size: isSelected ? 14 : 11, weight: .semibold))
                .foregroundStyle(.white)
        }
        .animation(reduceMotion ? nil : .spring(response: 0.3), value: isSelected)
    }
}

private struct ClusterMapPin: View {
    let count: Int
    let tint: Color

    private var size: CGFloat {
        switch count {
        case ..<10: return 40
        case ..<50: return 48
        default: return 56
        }
    }

    var body: some View {
        ZStack {
            Circle()
                .fill(tint.opacity(0.25))
                .frame(width: size + 14, height: size + 14)

            Circle()
                .fill(tint)
                .frame(width: size, height: size)
                .shadow(color: tint.opacity(0.4), radius: 4)

            Text("\(count)")
                .font(.system(size: size * 0.38, weight: .bold))
                .foregroundStyle(.white)
                .minimumScaleFactor(0.5)
                .lineLimit(1)
                .padding(4)
        }
    }
}

private struct AttractionMapPin: View {
    let type: AttractionType
    var isSelected: Bool = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            Circle()
                .fill(MapPalette.attraction)
                .frame(width: isSelected ? 38 : 30, height: isSelected ? 38 : 30)
                .shadow(color: MapPalette.attraction.opacity(0.4), radius: isSelected ? 6 : 3)

            Image(systemName: type.icon)
                .font(.system(size: isSelected ? 14 : 11, weight: .semibold))
                .foregroundStyle(.white)
        }
        .animation(reduceMotion ? nil : .spring(response: 0.3), value: isSelected)
    }
}

// MARK: - Cluster Disambiguation Sheet

/// Lists the members of a tapped cluster so co-located pins stay selectable even
/// when the map is in clustering mode (IOS-AUDIT-UX-027).
private struct ClusterDisambiguationSheet: View {
    let members: [MapMember]
    let onSelect: (MapMember) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List(members) { member in
                Button {
                    onSelect(member)
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: member.icon)
                            .foregroundStyle(member.tint)
                            .frame(width: 24)
                            .accessibilityHidden(true)
                        Text(member.title)
                            .foregroundStyle(.primary)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                }
                .accessibilityHint("Shows it on the map")
            }
            .navigationTitle("\(members.count) places here")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }
}

#Preview {
    EventMapView()
}
