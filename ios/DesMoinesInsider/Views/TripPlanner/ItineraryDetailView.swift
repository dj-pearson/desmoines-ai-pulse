import SwiftUI
import MapKit
import CoreLocation
import EventKit

/// IOS-PARITY-001 · Day-by-day itinerary detail.
///
/// Renders a generated/saved trip as native day cards with a map preview,
/// drag-to-reorder (persisted), share (public link), and add-to-calendar. Hosts
/// the IOS-ADS-015 Trip Planner sponsored placement (one labeled stop). Loading,
/// offline, and error states are handled (IOS-COMPLY-004).
struct ItineraryDetailView: View {
    let trip: TripPlan

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var service = TripPlannerService.shared
    @State private var network = NetworkMonitor.shared
    @State private var itemsByDay: [Int: [TripPlanItem]] = [:]
    @State private var tips: [String] = []
    @State private var packingList: [String] = []
    @State private var sponsored: SponsoredPickService.SponsoredPick?
    @State private var isLoading = true
    @State private var loadFailed = false
    @State private var shareItems: [Any]?
    @State private var calendarMessage: String?
    @State private var shareErrorMessage: String?
    @State private var toast: ToastMessage?
    @State private var editMode: EditMode = .inactive
    /// In flight for Add to Calendar. Without it a second tap ran the whole
    /// EventKit write again and created a duplicate of every stop, because
    /// nothing in the loop below checks for an event it already added
    /// (IOS-AUDIT-UX-053).
    @State private var isAddingToCalendar = false

    private var days: [Int] { itemsByDay.keys.sorted() }
    private var allItems: [TripPlanItem] { days.flatMap { itemsByDay[$0] ?? [] } }

    var body: some View {
        List {
            headerSection

            if isLoading {
                Section { loadingRow }
            } else if loadFailed {
                Section { errorRow }
            } else {
                if !mapLocations.isEmpty {
                    Section {
                        TripMapPreview(locations: mapLocations)
                            .frame(height: 180)
                            .listRowInsets(EdgeInsets())
                    }
                }

                ForEach(days, id: \.self) { day in
                    Section("Day \(day)") {
                        let dayItems = itemsByDay[day] ?? []
                        ForEach(Array(dayItems.enumerated()), id: \.element.id) { index, item in
                            ItineraryItemRow(item: item)
                                // Drag-reordering is inaccessible to VoiceOver, so
                                // expose explicit move actions (IOS-AUDIT-UX-042).
                                .accessibilityActions {
                                    if index > 0 {
                                        Button("Move up") {
                                            move(day: day, from: IndexSet(integer: index), to: index - 1)
                                        }
                                    }
                                    if index < dayItems.count - 1 {
                                        Button("Move down") {
                                            move(day: day, from: IndexSet(integer: index), to: index + 2)
                                        }
                                    }
                                }
                        }
                        .onMove { offsets, destination in
                            move(day: day, from: offsets, to: destination)
                        }
                    }
                }

                if let sponsored {
                    Section("Sponsored") {
                        SponsoredPickCard(pick: sponsored, surface: .tripPlanner)
                            .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                    }
                }

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
        }
        .environment(\.editMode, $editMode)
        .navigationTitle(trip.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { Task { await share() } } label: { Label("Share itinerary", systemImage: "square.and.arrow.up") }
                    Button { Task { await addToCalendar() } } label: {
                        Label(
                            isAddingToCalendar ? "Adding to Calendar..." : "Add to Calendar",
                            systemImage: "calendar.badge.plus"
                        )
                    }
                    .disabled(isAddingToCalendar)
                    Button {
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
                    } label: {
                        Label(editMode.isEditing ? "Done reordering" : "Reorder stops", systemImage: "arrow.up.arrow.down")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .accessibilityLabel("Itinerary options")
            }
        }
        .sheet(isPresented: Binding(get: { shareItems != nil }, set: { if !$0 { shareItems = nil } })) {
            if let shareItems { ShareSheet(items: shareItems) }
        }
        .alert("Calendar", isPresented: Binding(get: { calendarMessage != nil }, set: { if !$0 { calendarMessage = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(calendarMessage ?? "")
        }
        .alert("Couldn't Share", isPresented: Binding(get: { shareErrorMessage != nil }, set: { if !$0 { shareErrorMessage = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(shareErrorMessage ?? "")
        }
        .toastOverlay(message: $toast)
        .task { await load() }
    }

    // MARK: - Sections

    private var headerSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 6) {
                Text(trip.dateRangeDisplay)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.accentColor)
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

    // MARK: - Data

    private var mapLocations: [String] {
        allItems.compactMap { item in
            guard let loc = item.location, !loc.isEmpty else { return nil }
            return loc
        }
    }

    private func load() async {
        isLoading = true
        loadFailed = false

        // Fresh-from-generation trips arrive with items/tips already attached.
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

        itemsByDay = Dictionary(grouping: items.sorted { ($0.dayNumber, $0.orderIndex) < ($1.dayNumber, $1.orderIndex) }) { $0.dayNumber }
        isLoading = false

        // IOS-ADS-015 Trip Planner sponsored placement (free-tier only, server-eligible).
        sponsored = await SponsoredPickService.shared.pick(for: .tripPlanner)
    }

    private func move(day: Int, from offsets: IndexSet, to destination: Int) {
        guard var dayItems = itemsByDay[day] else { return }
        dayItems.move(fromOffsets: offsets, toOffset: destination)
        itemsByDay[day] = dayItems
        UISelectionFeedbackGenerator().selectionChanged()
        Task {
            let ok = await service.persistOrder(dayItems)
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
        itemsByDay = Dictionary(grouping: items.sorted { ($0.dayNumber, $0.orderIndex) < ($1.dayNumber, $1.orderIndex) }) { $0.dayNumber }
    }

    private func share() async {
        guard let code = await service.share(tripId: trip.id),
              let url = service.shareURL(for: code) else {
            shareErrorMessage = "Couldn't create a share link. Try again."
            return
        }
        shareItems = ["Check out my Des Moines itinerary: \(trip.title)", url]
    }

    // MARK: - Calendar (EventKit) — adds each timed stop on its day

    private func addToCalendar() async {
        // The permission prompt alone makes this multi-second, and the menu
        // stays open behind it. The disabled state above is the visible half;
        // this is the half that holds when the state has not repainted yet.
        guard !isAddingToCalendar else { return }
        isAddingToCalendar = true
        defer { isAddingToCalendar = false }

        let fmt = DateFormatter()
        fmt.calendar = Calendar(identifier: .gregorian)
        fmt.locale = Locale(identifier: "en_US_POSIX")
        fmt.dateFormat = "yyyy-MM-dd"
        guard let tripStart = fmt.date(from: String(trip.startDate.prefix(10))) else {
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

            var added = 0
            let calendar = Calendar(identifier: .gregorian)
            for item in allItems {
                guard let startTime = item.startTime,
                      let dayDate = calendar.date(byAdding: .day, value: item.dayNumber - 1, to: tripStart),
                      let start = combine(day: dayDate, time: startTime) else { continue }

                let calEvent = EKEvent(eventStore: store)
                calEvent.title = item.title ?? "Itinerary stop"
                calEvent.startDate = start
                calEvent.endDate = start.addingTimeInterval(TimeInterval((item.durationMinutes ?? 60) * 60))
                calEvent.location = item.location
                calEvent.notes = item.aiReason ?? item.notes
                calEvent.calendar = store.defaultCalendarForNewEvents
                try store.save(calEvent, span: .thisEvent)
                added += 1
            }

            calendarMessage = added > 0
                ? "Added \(added) stop\(added == 1 ? "" : "s") to your calendar."
                : "No timed stops to add."
        } catch {
            calendarMessage = error.localizedDescription
        }
    }

    private func combine(day: Date, time: String) -> Date? {
        let cal = Calendar(identifier: .gregorian)
        let parts = time.split(separator: ":").compactMap { Int($0) }
        guard parts.count >= 2 else { return nil }
        return cal.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: day)
    }
}

// MARK: - Item row

private struct ItineraryItemRow: View {
    let item: TripPlanItem

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 2) {
                Image(systemName: item.systemImage)
                    .font(.subheadline)
                    .foregroundStyle(Color.accentColor)
                    .frame(width: 24)
                if let time = item.startTimeDisplay {
                    Text(time)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                Text(item.title ?? "Stop")
                    .font(.subheadline.weight(.semibold))
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
                if let cost = item.estimatedCost, !cost.isEmpty {
                    Text(cost)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.tertiary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
    }

    private var accessibilityText: String {
        var parts = [item.title ?? "Stop"]
        if let time = item.startTimeDisplay { parts.insert("At \(time)", at: 0) }
        if let location = item.location { parts.append("at \(location)") }
        return parts.joined(separator: ", ")
    }
}

// MARK: - Map preview

/// Best-effort map of itinerary stops: geocodes the free-text locations (capped)
/// and drops markers. Degrades gracefully — if nothing geocodes, the section is
/// hidden by the parent. Offline-safe (geocode just fails quietly).
private struct TripMapPreview: View {
    let locations: [String]

    @State private var markers: [GeocodedPlace] = []
    @State private var cameraPosition: MapCameraPosition = .automatic

    private struct GeocodedPlace: Identifiable {
        let id = UUID()
        let name: String
        let coordinate: CLLocationCoordinate2D
    }

    var body: some View {
        Map(position: $cameraPosition) {
            ForEach(markers) { place in
                Marker(place.name, coordinate: place.coordinate)
            }
        }
        .mapStyle(.standard)
        .allowsHitTesting(false)
        .accessibilityLabel("Map of \(markers.count) itinerary stops")
        // Keyed on the stops. A bare `.task` re-runs on every appearance, so
        // returning to an itinerary re-issued the whole batch (PERF-024).
        .task(id: locations) { await geocode() }
    }

    /// Stops geocoded per itinerary. CLGeocoder is rate-limited per app, so
    /// this stays a cap rather than becoming "all of them".
    private static let maxStops = 8

    private func geocode() async {
        // Sorted, not just de-duplicated: Set iteration order varies per run,
        // so which eight stops survived the cap - and therefore what the map
        // framed - changed between appearances of the same itinerary.
        let unique = Array(Set(locations)).sorted().prefix(Self.maxStops)

        // Anything already resolved is painted before a single request goes
        // out, so a revisit draws immediately instead of rebuilding the map
        // marker by marker.
        var found: [GeocodedPlace] = []
        var pending: [String] = []
        for location in unique {
            let query = TripGeocodeCache.normalizedQuery(for: location)
            if let coordinate = TripGeocodeCache.cached(query) {
                found.append(GeocodedPlace(name: location, coordinate: coordinate))
            } else {
                pending.append(location)
            }
        }
        markers = found
        guard !pending.isEmpty else { return }

        let geocoder = CLGeocoder()
        for location in pending {
            // `try?` swallows the CancellationError the geocoder throws, so
            // without this the loop kept issuing requests for a screen the
            // user had already left - the exact traffic the rate limit is
            // counting.
            guard !Task.isCancelled else { return }

            let query = TripGeocodeCache.normalizedQuery(for: location)
            guard let placemarks = try? await geocoder.geocodeAddressString(query),
                  let coordinate = placemarks.first?.location?.coordinate else { continue }

            TripGeocodeCache.store(coordinate, for: query)
            found.append(GeocodedPlace(name: location, coordinate: coordinate))
            markers = found
        }
    }
}
