import SwiftUI
import MapKit
import CoreLocation
import EventKit

/// IOS-PARITY-001 · Day-by-day itinerary detail.
///
/// Renders a generated/saved trip as native day cards with a map preview,
/// drag-to-reorder (persisted), share (as text), and add-to-calendar. Hosts
/// the IOS-ADS-015 Trip Planner sponsored placement (one labeled stop). Loading,
/// offline, and error states are handled (IOS-COMPLY-004). Stops open their
/// listing and offer Directions (IOS-DD-TRIP-PLANNER-12).
struct ItineraryDetailView: View {
    let trip: TripPlan

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.openURL) private var openURL
    @State private var service = TripPlannerService.shared
    @State private var network = NetworkMonitor.shared
    @State private var itemsByDay: [Int: [TripPlanItem]] = [:]
    @State private var tips: [String] = []
    @State private var packingList: [String] = []
    @State private var sponsored: SponsoredPickService.SponsoredPick?
    @State private var isLoading = true
    @State private var loadFailed = false
    /// Set after the first successful load. `.task` runs again whenever the
    /// view reappears (returning from Where to stay), and load() reseeds from
    /// the immutable `trip.items`, which reverted a reordered trip and re-picked
    /// the sponsored card (IOS-DD-TRIP-PLANNER-10). After the first load,
    /// itemsByDay is the source of truth.
    @State private var hasLoaded = false
    @State private var shareItems: [Any]?
    @State private var calendarMessage: String?
    @State private var toast: ToastMessage?
    @State private var editMode: EditMode = .inactive
    /// In flight for Add to Calendar. Without it a second tap ran the whole
    /// EventKit write again and created a duplicate of every stop, because
    /// nothing in the loop below checks for an event it already added
    /// (IOS-AUDIT-UX-053).
    @State private var isAddingToCalendar = false
    /// The trip was exported before; ask before writing the stops again
    /// (IOS-DD-TRIP-PLANNER-09).
    @State private var confirmCalendarRepeat = false
    @State private var mapMarkers: [TripMapMarker] = []
    @State private var showFullMap = false
    /// A stop's listing, presented here rather than through the root
    /// DeepLinkHandler: the planner is often itself a sheet or a full-screen
    /// cover, and the root cannot present over it.
    @State private var openedStop: MainTabView.DeepLinkPresentation?

    private var days: [Int] { itemsByDay.keys.sorted() }
    private var allItems: [TripPlanItem] { days.flatMap { itemsByDay[$0] ?? [] } }
    private var mapStops: [TripMapStop] { TripStopLinks.mapStops(from: allItems) }

    var body: some View {
        presentingList
            .alert("Calendar", isPresented: Binding(get: { calendarMessage != nil }, set: { if !$0 { calendarMessage = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(calendarMessage ?? "")
            }
            .confirmationDialog("These stops are already in your calendar", isPresented: $confirmCalendarRepeat, titleVisibility: .visible) {
                Button("Add again") { Task { await addToCalendar() } }
                Button("Cancel", role: .cancel) {}
            }
            .toastOverlay(message: $toast)
            .task(id: trip.id) {
                guard !hasLoaded else { return }
                await load()
            }
            // Keyed on the stops. A bare `.task` re-runs on every appearance, so
            // returning to an itinerary re-issued the whole batch (PERF-024).
            .task(id: mapStops) { await resolveMapMarkers() }
    }

    /// The list with its toolbar and sheets; split from `body` so neither
    /// modifier chain is one long expression for the type checker.
    private var presentingList: some View {
        List {
            headerSection

            if isLoading {
                Section { loadingRow }
            } else if loadFailed {
                Section { errorRow }
            } else {
                loadedSections
            }
        }
        .environment(\.editMode, $editMode)
        .navigationTitle(trip.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { optionsToolbar }
        .sheet(isPresented: Binding(get: { shareItems != nil }, set: { if !$0 { shareItems = nil } })) {
            if let shareItems { ShareSheet(items: shareItems) }
        }
        .sheet(item: $openedStop) { DeepLinkResolverView(presentation: $0) }
        .sheet(isPresented: $showFullMap) { TripFullMapSheet(markers: mapMarkers) }
    }

    // MARK: - Sections

    @ViewBuilder
    private var loadedSections: some View {
        if !mapMarkers.isEmpty {
            Section {
                TripMapPreview(markers: mapMarkers) { showFullMap = true }
                    .frame(height: 180)
                    .listRowInsets(EdgeInsets())
            }
        }

        ForEach(days, id: \.self) { day in
            daySection(day)
        }

        if let sponsored {
            Section("Sponsored") {
                SponsoredPickCard(pick: sponsored, surface: .tripPlanner)
                    .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
            }
        }

        extrasSections
    }

    private func daySection(_ day: Int) -> some View {
        let dayItems = itemsByDay[day] ?? []
        return Section(TripSchedule.dayTitle(day: day, tripStart: trip.startDate)) {
            ForEach(Array(dayItems.enumerated()), id: \.element.id) { index, item in
                stopRow(item, day: day, index: index, count: dayItems.count)
            }
            .onMove { offsets, destination in
                move(day: day, from: offsets, to: destination)
            }
        }
    }

    @ViewBuilder
    private func stopRow(_ item: TripPlanItem, day: Int, index: Int, count: Int) -> some View {
        let presentation = TripStopLinks.destination(for: item).flatMap(Self.presentation(for:))
        let directions = TripStopLinks.directionsURL(for: item, base: MapPopupModel.mapsBase)

        Group {
            if let presentation, !editMode.isEditing {
                Button { openedStop = presentation } label: {
                    ItineraryItemRow(item: item)
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opens details")
            } else {
                ItineraryItemRow(item: item)
            }
        }
        .swipeActions(edge: .trailing) {
            if let directions {
                Button { openURL(directions) } label: {
                    Label("Directions", systemImage: "arrow.triangle.turn.up.right.diamond")
                }
                .tint(.accentColor)
            }
        }
        .contextMenu {
            if let presentation {
                Button { openedStop = presentation } label: { Label("Open details", systemImage: "info.circle") }
            }
            if let directions {
                Button { openURL(directions) } label: {
                    Label("Directions", systemImage: "arrow.triangle.turn.up.right.diamond")
                }
            }
        }
        // Drag-reordering is inaccessible to VoiceOver, so expose explicit
        // move actions (IOS-AUDIT-UX-042).
        .accessibilityActions {
            if index > 0 {
                Button("Move up") { move(day: day, from: IndexSet(integer: index), to: index - 1) }
            }
            if index < count - 1 {
                Button("Move down") { move(day: day, from: IndexSet(integer: index), to: index + 2) }
            }
            if let directions {
                Button("Directions") { openURL(directions) }
            }
        }
    }

    @ViewBuilder
    private var extrasSections: some View {
        if !tips.isEmpty {
            Section("Local tips") {
                ForEach(Array(tips.enumerated()), id: \.offset) { _, tip in
                    Label(tip, systemImage: "lightbulb.fill")
                        .font(.subheadline)
                }
            }
        }

        if !packingList.isEmpty {
            Section("Don't forget") {
                ForEach(Array(packingList.enumerated()), id: \.offset) { _, item in
                    Label(item, systemImage: "checkmark.circle")
                        .font(.subheadline)
                }
            }
        }

        // IOS-PARITY-003 cross-link: turn an itinerary into a booking.
        Section {
            NavigationLink {
                HotelsView(ownsNavigationStack: false)
            } label: {
                Label("Where to stay", systemImage: "bed.double.fill")
            }
        } footer: {
            Text("Browse hotels near your plans and book your stay.")
        }
    }

    @ToolbarContentBuilder
    private var optionsToolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button { share() } label: { Label("Share as text", systemImage: "square.and.arrow.up") }
                Button { requestAddToCalendar() } label: {
                    Label(
                        isAddingToCalendar ? "Adding to Calendar..." : "Add to Calendar",
                        systemImage: "calendar.badge.plus"
                    )
                }
                .disabled(isAddingToCalendar)
                Button { toggleReorder() } label: {
                    Label(editMode.isEditing ? "Done reordering" : "Reorder stops", systemImage: "arrow.up.arrow.down")
                }
            } label: {
                Image(systemName: "ellipsis.circle")
            }
            .accessibilityLabel("Itinerary options")
        }
    }

    private var headerSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 6) {
                Text(trip.dateRangeDisplay)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.accentColor)
                if DesMoinesTime.deviceDiffersFromCentral() {
                    Text("Times are Des Moines time (CT).")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if let description = trip.description, !description.isEmpty {
                    Text(description)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                if let cost = trip.totalEstimatedCost, !cost.isEmpty {
                    Label("Est. \(cost)", systemImage: "dollarsign.circle")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 2)
            .accessibilityElement(children: .combine)
        }
    }

    private var loadingRow: some View {
        HStack { ProgressView().controlSize(.small); Text("Loading itinerary…").foregroundStyle(.secondary) }
    }

    private var errorRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(
                network.isConnected ? "Couldn't load this itinerary." : "You're offline.",
                systemImage: network.isConnected ? "exclamationmark.triangle.fill" : "wifi.slash"
            )
            .foregroundStyle(.orange)
            Button("Try again") { Task { await load() } }
                .buttonStyle(.bordered)
        }
    }

    // MARK: - Routing

    /// The in-app presentation for a stop's listing. Discover destinations
    /// and tabs are not stop targets.
    static func presentation(for destination: DeepLinkHandler.Destination) -> MainTabView.DeepLinkPresentation? {
        switch destination {
        case .event(let id): return .event(id)
        case .restaurant(let id): return .restaurant(id)
        case .attraction(let id): return .attraction(id)
        case .hotel(let id): return .hotel(id)
        case .article(let id): return .article(id)
        case .tab, .discover: return nil
        }
    }

    // MARK: - Data

    private func load() async {
        isLoading = true
        loadFailed = false

        // Fresh-from-generation trips arrive with items/tips already attached;
        // saved rows carry tips/packing_list since IOS-DD-TRIP-PLANNER-17.
        var items = trip.items ?? []
        tips = trip.tips ?? []
        packingList = trip.packingList ?? []

        if items.isEmpty {
            do {
                items = try await service.fetchItems(tripId: trip.id)
            } catch {
                // A real fetch failure — show the error+retry state instead of a
                // blank itinerary (IOS-AUDIT-FEAT-023).
                loadFailed = true
                isLoading = false
                return
            }
        }

        if items.isEmpty && !network.isConnected {
            loadFailed = true
            isLoading = false
            return
        }

        itemsByDay = Self.grouped(items)
        isLoading = false
        hasLoaded = true

        // IOS-ADS-015 Trip Planner sponsored placement (free-tier only, server-eligible).
        sponsored = await SponsoredPickService.shared.pick(for: .tripPlanner)
    }

    private static func grouped(_ items: [TripPlanItem]) -> [Int: [TripPlanItem]] {
        Dictionary(grouping: items.sorted { ($0.dayNumber, $0.orderIndex) < ($1.dayNumber, $1.orderIndex) }) { $0.dayNumber }
    }

    private func toggleReorder() {
        let entering = !editMode.isEditing
        withAnimation(reduceMotion ? nil : .default) {
            editMode = entering ? .active : .inactive
        }
        // Announce the state change — without it VoiceOver users
        // get no confirmation they entered reorder mode (UX-042).
        UIAccessibility.post(
            notification: .announcement,
            argument: entering
                ? "Reordering stops. Use each stop's actions to move it up or down."
                : "Done reordering."
        )
    }

    private func move(day: Int, from offsets: IndexSet, to destination: Int) {
        guard var dayItems = itemsByDay[day] else { return }
        dayItems.move(fromOffsets: offsets, toOffset: destination)
        itemsByDay[day] = dayItems
        UISelectionFeedbackGenerator().selectionChanged()
        let tripId = trip.id
        let newOrder = dayItems
        Task {
            let ok = await service.persistOrder(tripId: tripId, day: day, items: newOrder)
            if !ok {
                // Don't let the visible order silently diverge from the server —
                // tell the user and reload server truth (IOS-AUDIT-FEAT-023).
                toast = .error("Couldn't save the new order. Restored.")
                await refetchItems()
            }
        }
    }

    /// Reloads items from the server, discarding any unsynced local order.
    private func refetchItems() async {
        guard let items = try? await service.fetchItems(tripId: trip.id) else { return }
        itemsByDay = Self.grouped(items)
    }

    /// Plain text, no network, nothing made public (IOS-DD-TRIP-PLANNER-07).
    private func share() {
        shareItems = [TripShareText.make(title: trip.title, startDate: trip.startDate, itemsByDay: itemsByDay)]
    }

    // MARK: - Map

    /// Stored coordinates first; only stops without one are geocoded, still
    /// capped (CLGeocoder is rate-limited per app).
    private func resolveMapMarkers() async {
        let stops = mapStops
        var found: [TripMapMarker] = []
        var pending: [TripMapStop] = []
        for stop in stops {
            if let coordinate = stop.coordinate {
                found.append(TripMapMarker(stop: stop, coordinate: coordinate))
            } else if let location = stop.location,
                      let cached = TripGeocodeCache.cached(TripGeocodeCache.normalizedQuery(for: location)) {
                found.append(TripMapMarker(stop: stop, coordinate: cached))
            } else if stop.location != nil {
                pending.append(stop)
            }
        }
        // Anything already resolved is painted before a single request goes
        // out, so a revisit draws immediately.
        mapMarkers = found.sorted { $0.stop.number < $1.stop.number }

        let geocoder = CLGeocoder()
        for stop in pending.prefix(TripMapMarker.maxGeocodedStops) {
            // `try?` swallows the CancellationError the geocoder throws, so
            // without this the loop kept issuing requests for a screen the
            // user had already left.
            guard !Task.isCancelled, let location = stop.location else { return }
            let query = TripGeocodeCache.normalizedQuery(for: location)
            guard let placemarks = try? await geocoder.geocodeAddressString(query),
                  let coordinate = placemarks.first?.location?.coordinate,
                  GeoBoundingBox.isPlausibleMapCoordinate(coordinate) else { continue }
            TripGeocodeCache.store(coordinate, for: query)
            found.append(TripMapMarker(stop: stop, coordinate: coordinate))
            mapMarkers = found.sorted { $0.stop.number < $1.stop.number }
        }
    }

    // MARK: - Calendar (EventKit) — adds each timed stop on its day

    private func requestAddToCalendar() {
        guard !isAddingToCalendar else { return }
        if TripCalendarExports.identifiers(for: trip.id) != nil {
            confirmCalendarRepeat = true
        } else {
            Task { await addToCalendar() }
        }
    }

    private func addToCalendar() async {
        // The permission prompt alone makes this multi-second, and the menu
        // stays open behind it. The disabled state above is the visible half;
        // this is the half that holds when the state has not repainted yet.
        guard !isAddingToCalendar else { return }
        isAddingToCalendar = true
        defer { isAddingToCalendar = false }

        // Central days and times, whatever zone the phone is in
        // (IOS-DD-TRIP-PLANNER-09).
        guard let tripStart = TripSchedule.tripDay(trip.startDate) else {
            calendarMessage = "This itinerary has no valid dates."
            return
        }

        let store = EKEventStore()
        do {
            let granted = try await store.requestWriteOnlyAccessToEvents()
            guard granted else {
                calendarMessage = "Calendar access was denied. Enable it in Settings."
                return
            }

            let items = allItems
            let windows = TripSchedule.calendarWindows(tripStart: tripStart, items: items)
            // A stop with no time, or a time that cannot be parsed, is counted
            // and reported rather than vanishing (IOS-AUDIT-UX-059).
            let skipped = items.count - windows.count
            var identifiers: [String] = []

            for window in windows {
                let item = window.item
                let calEvent = EKEvent(eventStore: store)
                calEvent.title = item.title ?? "Itinerary stop"
                calEvent.startDate = window.start
                calEvent.endDate = window.end
                calEvent.timeZone = DesMoinesTime.timeZone
                calEvent.location = item.location
                calEvent.notes = item.aiReason ?? item.notes
                calEvent.calendar = store.defaultCalendarForNewEvents
                try store.save(calEvent, span: .thisEvent)
                if let id = calEvent.eventIdentifier { identifiers.append(id) }
            }

            if !identifiers.isEmpty {
                TripCalendarExports.record(identifiers, for: trip.id)
            }
            calendarMessage = Self.calendarSummary(added: windows.count, skipped: skipped)
        } catch {
            calendarMessage = error.localizedDescription
        }
    }

    /// What the user is told after a calendar write.
    ///
    /// Pure, so the counting can be asserted: the interesting cases are the ones
    /// nobody writes by hand - some added and some skipped, and everything
    /// skipped, which used to read as "No timed stops to add" whether the stops
    /// had no times or had times this app could not parse.
    static func calendarSummary(added: Int, skipped: Int) -> String {
        let stops = { (n: Int) in "\(n) stop\(n == 1 ? "" : "s")" }

        switch (added, skipped) {
        case (0, 0):
            return "This itinerary has no stops to add."
        case (0, _):
            return "Couldn't add \(stops(skipped)) - they have no start time."
        case (_, 0):
            return "Added \(stops(added)) to your calendar."
        default:
            return "Added \(stops(added)). Skipped \(skipped) with no start time."
        }
    }
}

// MARK: - Calendar export record

/// Which trips were already written to the calendar, so a second Add to
/// Calendar asks first instead of duplicating every stop
/// (IOS-DD-TRIP-PLANNER-09). Device-local on purpose: the events live in this
/// device's calendar.
enum TripCalendarExports {
    static let key = "trip_calendar_exports_v1"

    static func identifiers(for tripId: String, defaults: UserDefaults = .standard) -> [String]? {
        let all = defaults.dictionary(forKey: key) as? [String: [String]]
        return all?[tripId]
    }

    static func record(_ identifiers: [String], for tripId: String, defaults: UserDefaults = .standard) {
        var all = (defaults.dictionary(forKey: key) as? [String: [String]]) ?? [:]
        all[tripId] = identifiers
        defaults.set(all, forKey: key)
    }
}

// MARK: - Item row

private struct ItineraryItemRow: View {
    let item: TripPlanItem

    private var timeText: String? { TripSchedule.timeRange(start: item.startTime, end: item.endTime) }
    private var extraNote: String? {
        guard let notes = item.notes?.trimmingCharacters(in: .whitespacesAndNewlines),
              !notes.isEmpty, notes != item.aiReason else { return nil }
        return notes
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: item.systemImage)
                .font(.subheadline)
                .foregroundStyle(Color.accentColor)
                .frame(width: 24)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                if let timeText {
                    Text(timeText)
                        .font(.subheadline.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                Text(item.title ?? "Stop")
                    .font(.subheadline.weight(.semibold))
                details
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
    }

    @ViewBuilder
    private var details: some View {
        if let location = item.location, !location.isEmpty {
            Label(location, systemImage: "mappin")
                .font(.caption)
                .foregroundStyle(.secondary)
                .labelStyle(.titleAndIcon)
        }
        if let reason = item.aiReason, !reason.isEmpty {
            Text(reason)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(3)
        }
        if let extraNote {
            Label(extraNote, systemImage: "lightbulb")
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        if let cost = item.estimatedCost, !cost.isEmpty {
            Text(cost)
                .font(.caption2.weight(.medium))
                .foregroundStyle(.tertiary)
        }
    }

    private var accessibilityText: String {
        var parts = [item.title ?? "Stop"]
        if let timeText { parts.insert("At \(timeText)", at: 0) }
        if let location = item.location { parts.append("at \(location)") }
        if let extraNote { parts.append("Tip: \(extraNote)") }
        return parts.joined(separator: ", ")
    }
}

// MARK: - Map

/// A stop placed on the map.
struct TripMapMarker: Identifiable, Equatable {
    let stop: TripMapStop
    let coordinate: CLLocationCoordinate2D

    var id: Int { stop.number }

    /// Stops geocoded per itinerary. CLGeocoder is rate-limited per app, so
    /// this stays a cap rather than becoming "all of them".
    static let maxGeocodedStops = 8

    static func == (lhs: TripMapMarker, rhs: TripMapMarker) -> Bool {
        lhs.stop == rhs.stop
            && lhs.coordinate.latitude == rhs.coordinate.latitude
            && lhs.coordinate.longitude == rhs.coordinate.longitude
    }
}

/// Numbered pins for the resolved stops (IOS-DD-TRIP-PLANNER-11). Only shown
/// once at least one stop has a coordinate; a tap opens the full map.
private struct TripMapPreview: View {
    let markers: [TripMapMarker]
    let onExpand: () -> Void

    @State private var cameraPosition: MapCameraPosition = .automatic

    var body: some View {
        Map(position: $cameraPosition, interactionModes: []) {
            ForEach(markers) { marker in
                Marker(marker.stop.title, monogram: Text("\(marker.stop.number)"), coordinate: marker.coordinate)
            }
        }
        .mapStyle(.standard)
        .onChange(of: markers) { _, _ in cameraPosition = .automatic }
        .contentShape(Rectangle())
        .onTapGesture { onExpand() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Map of \(markers.count) itinerary stops")
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("Opens a larger map")
        .accessibilityAction { onExpand() }
    }
}

private struct TripFullMapSheet: View {
    let markers: [TripMapMarker]
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Map(initialPosition: .automatic) {
                ForEach(markers) { marker in
                    Marker(marker.stop.title, monogram: Text("\(marker.stop.number)"), coordinate: marker.coordinate)
                }
            }
            .mapStyle(.standard)
            .ignoresSafeArea(edges: .bottom)
            .navigationTitle("Trip map")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
