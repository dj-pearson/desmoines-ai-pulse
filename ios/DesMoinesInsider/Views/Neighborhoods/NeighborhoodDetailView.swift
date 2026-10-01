import SwiftUI
import CoreLocation

/// One neighborhood's curated guide (IOS-PARITY-006): dining, attractions, and
/// upcoming events in the area, with an opt-in "nearby" location sort.
struct NeighborhoodDetailView: View {
    let neighborhood: Neighborhood

    @State private var viewModel: NeighborhoodViewModel
    @State private var toast: ToastMessage?

    init(neighborhood: Neighborhood) {
        self.neighborhood = neighborhood
        _viewModel = State(wrappedValue: NeighborhoodViewModel(neighborhood: neighborhood))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header
                sections
            }
            .padding(.vertical, 8)
        }
        .navigationTitle(neighborhood.name)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await viewModel.refresh() }
        .reloadOnReconnect(if: viewModel.isEmpty) { await viewModel.refresh() }
        .navigationDestination(for: Event.self) { EventDetailView(event: $0) }
        .navigationDestination(for: Restaurant.self) { RestaurantDetailView(restaurant: $0) }
        .navigationDestination(for: Attraction.self) { AttractionDetailView(attraction: $0) }
        .toastOverlay(message: $toast)
        .task { await viewModel.loadInitialData() }
    }

    @ViewBuilder
    private var sections: some View {
        if viewModel.isLoading && viewModel.isEmpty {
            loadingState
        } else if let error = viewModel.loadError, viewModel.isEmpty {
            // A failed load is not an empty area (IOS-DD-BROWSE-18).
            ErrorStateView(message: error) {
                Task { await viewModel.refresh() }
            }
            .padding(.top, 16)
        } else if viewModel.isEmpty {
            EmptyStateView(
                icon: "building.2",
                title: "Still mapping this area",
                message: "We don't have listings tagged to \(neighborhood.name) yet. Search the whole metro in the meantime.",
                actionTitle: "Search the metro",
                action: { DeepLinkHandler.shared.open(.tab(.search)) }
            )
            .padding(.top, 16)
        } else {
            restaurantsRail
            AdSlot(.feed)
            attractionsRail
            if !viewModel.events.isEmpty { eventsSection }
        }
    }

    // MARK: - Rails

    @ViewBuilder
    private var restaurantsRail: some View {
        if !viewModel.restaurants.isEmpty {
            rail(title: "Where to eat", systemImage: "fork.knife") {
                ForEach(viewModel.restaurants) { restaurant in
                    NavigationLink(value: restaurant) {
                        ContentCard(cardData(restaurant.cardData, coordinate: restaurant.coordinate), variant: .compact, decorative: true)
                    }
                    .buttonStyle(.plain)
                    // The card is hidden from VoiceOver (IOS-DD-BROWSE-07).
                    .accessibilityLabel(restaurant.railAccessibilityLabel)
                }
            }
        }
    }

    @ViewBuilder
    private var attractionsRail: some View {
        if !viewModel.attractions.isEmpty {
            rail(title: "Things to do", systemImage: "mappin.and.ellipse") {
                ForEach(viewModel.attractions) { attraction in
                    NavigationLink(value: attraction) {
                        ContentCard(cardData(attraction.cardData, coordinate: attraction.coordinate), variant: .compact, decorative: true)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(attraction.railAccessibilityLabel)
                }
            }
        }
    }

    /// With the nearby sort on, the second meta line is the distance, so the
    /// new order can be checked by eye (IOS-DD-BROWSE-19).
    private func cardData(_ base: ContentCardData, coordinate: CLLocationCoordinate2D?) -> ContentCardData {
        guard viewModel.usingLocation, let coordinate,
              let distance = LocationService.shared.formattedDistance(from: coordinate) else { return base }
        var data = base
        data.metaSecondary = CardMetaLine(icon: "location", text: distance)
        return data
    }

    // MARK: - Header (blurb + highlights + nearby toggle)

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(neighborhood.blurb)
                .font(.subheadline)
                .foregroundStyle(.secondary)

            // Plain text: the orange capsules looked like the tappable
            // chips elsewhere and did nothing (IOS-DD-BROWSE-19).
            if !neighborhood.highlights.isEmpty {
                Text("Known for: " + neighborhood.highlights.joined(separator: " \u{00B7} "))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            // Location integration (IOS-PARITY-006): nearest-first when enabled.
            if viewModel.usingLocation {
                Label("Sorted by distance from you", systemImage: "location.fill")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(Color.accentColor)
            } else {
                nearbyButton

                if viewModel.nearbyUnavailable {
                    // The button used to reload in the same order and say
                    // nothing, so a denied permission and a broken feature
                    // looked identical (IOS-AUDIT-UX-057).
                    HStack(spacing: 6) {
                        Image(systemName: "location.slash")
                        Text(nearbyNoticeText)
                        if canOpenLocationSettings {
                            Button("Settings") {
                                if let url = URL(string: UIApplication.openSettingsURLString) {
                                    UIApplication.shared.open(url)
                                }
                            }
                            .font(.caption.weight(.semibold))
                        }
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal)
    }

    private var nearbyButton: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            Task { await viewModel.enableNearby() }
        } label: {
            if viewModel.isLocating {
                // Up to 18s of permission prompt and cold GPS used to change
                // nothing on screen (IOS-DD-BROWSE-19).
                HStack(spacing: 6) {
                    ProgressView().controlSize(.small)
                    Text("Finding you...")
                }
                .font(.caption.weight(.semibold))
            } else {
                Label("Sort by what's nearby", systemImage: "location")
                    .font(.caption.weight(.semibold))
            }
        }
        .buttonStyle(.bordered)
        .disabled(viewModel.isLocating)
        .minHitTarget()
    }

    /// Denied is fixable from Settings; a missing fix is not, and telling
    /// someone to open Settings when the problem is that they are indoors is
    /// worse than saying nothing.
    private var canOpenLocationSettings: Bool {
        !LocationService.isAuthorized(LocationService.shared.authorizationStatus)
    }

    private var nearbyNoticeText: String {
        canOpenLocationSettings
            ? "Location is off, so results aren't sorted by distance."
            : "Couldn't get your location, so results aren't sorted by distance."
    }

    // MARK: - Events

    private var eventsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Events in \(neighborhood.name)", systemImage: "calendar")
                .font(.title3.bold())
                .padding(.horizontal)
                .accessibilityAddTraits(.isHeader)
            LazyVStack(spacing: 12) {
                ForEach(viewModel.events) { event in
                    NavigationLink(value: event) {
                        ContentCard(event.cardData, variant: .standard, toast: $toast)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)
        }
    }

    // MARK: - Rail

    private func rail<C: View>(title: String, systemImage: String, @ViewBuilder content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(title, systemImage: systemImage)
                .font(.title3.bold())
                .padding(.horizontal)
                .accessibilityAddTraits(.isHeader)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) { content() }
                    .padding(.horizontal)
            }
        }
    }

    private var loadingState: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(0..<3, id: \.self) { _ in
                ContentCardSkeleton(.standard).padding(.horizontal)
            }
        }
    }
}

#Preview {
    NavigationStack {
        NeighborhoodDetailView(neighborhood: Neighborhood.all[0])
    }
}
