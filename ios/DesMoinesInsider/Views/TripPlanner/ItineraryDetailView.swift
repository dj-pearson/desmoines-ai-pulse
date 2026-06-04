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
    @State private var editMode: EditMode = .inactive

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
                        ForEach(itemsByDay[day] ?? []) { item in
                            ItineraryItemRow(item: item)
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
                    Button { Task { await addToCalendar() } } label: { Label("Add to Calendar", systemImage: "calendar.badge.plus") }
                    Button {
                        withAnimation { editMode = editMode.isEditing ? .inactive : .active }
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
            items = await service.fetchItems(tripId: trip.id)
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
        Task { await service.persistOrder(dayItems) }
    }

    private func share() async {
        guard let code = await service.share(tripId: trip.id),
              let url = service.shareURL(for: code) else {
            calendarMessage = "Couldn't create a share link. Try again."
            return
        }
        shareItems = ["Check out my Des Moines itinerary: \(trip.title)", url]
    }

    // MARK: - Calendar (EventKit) — adds each timed stop on its day

    private func addToCalendar() async {
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
        .task { await geocode() }
    }

    private func geocode() async {
        let geocoder = CLGeocoder()
        // Cap to keep geocoding light and within rate limits.
        let unique = Array(Set(locations)).prefix(8)
        var found: [GeocodedPlace] = []
        for location in unique {
            let query = location.localizedCaseInsensitiveContains("Des Moines")
                ? location
                : "\(location), Des Moines, IA"
            if let placemarks = try? await geocoder.geocodeAddressString(query),
               let coord = placemarks.first?.location?.coordinate {
                found.append(GeocodedPlace(name: location, coordinate: coord))
            }
        }
        markers = found
    }
}
