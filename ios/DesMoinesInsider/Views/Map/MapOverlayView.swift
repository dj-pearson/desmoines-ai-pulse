import SwiftUI

/// The one message the map shows for its state (IOS-DD-MAP-10). It used to
/// have one string for everything: "No places found in this area. Try
/// expanding your search." with a Try Again that reloaded nearby even after a
/// search, and nothing at all when the filters hid every pin.
struct MapOverlayView: View {
    let viewModel: MapViewModel
    let onSearchThisArea: () -> Void

    var body: some View {
        switch viewModel.overlay {
        case .none, .partial:
            EmptyView()
        case .offline:
            // With earlier results still on the map, the status row shows a
            // chip instead of covering them.
            if viewModel.totalPinCount == 0 {
                MapMessageCard(icon: "wifi.slash", message: "Can't reach Des Moines Insider. Check your connection.") {
                    retryButton
                }
            }
        case .emptyArea:
            MapMessageCard(icon: "map", message: "Nothing here yet. Zoom out or search this area.") {
                Button("Search this area", action: onSearchThisArea)
                    .buttonStyle(.borderedProminent)
                    .minHitTarget()
            }
        case .noResults(let query):
            MapMessageCard(icon: "magnifyingglass", message: "No results for \"\(query)\"") {
                Button("Clear search") {
                    Task { await viewModel.clearSearch() }
                }
                .buttonStyle(.borderedProminent)
                .minHitTarget()
            }
        case .filteredOut(let hiddenByTime, let hiddenByQuickFilters, let hiddenKinds):
            MapMessageCard(icon: "line.3.horizontal.decrease.circle", message: filteredMessage(hiddenByTime: hiddenByTime)) {
                FilteredOutActions(
                    viewModel: viewModel,
                    hiddenByTime: hiddenByTime,
                    hiddenByQuickFilters: hiddenByQuickFilters,
                    hiddenKinds: hiddenKinds
                )
            }
        case .zoomIn:
            MapMessageCard(icon: "plus.magnifyingglass", message: "Zoom in to see places") {
                EmptyView()
            }
        }
    }

    private var retryButton: some View {
        Button {
            Task { await viewModel.retry() }
        } label: {
            Label("Try Again", systemImage: "arrow.clockwise")
        }
        .buttonStyle(.borderedProminent)
        .minHitTarget()
    }

    private func filteredMessage(hiddenByTime: Bool) -> String {
        guard hiddenByTime else { return "Nothing nearby matches these filters" }
        let chip = viewModel.timeChip
        let when: String
        switch chip {
        case .at6pm, .at8pm, .at10pm: when = "at " + chip.label(now: Date())
        case .now: when = "right now"
        case .tonight: when = "tonight"
        case .saturday: when = chip.label(now: Date())
        case .anytime: when = "then"
        }
        return "Nothing on \(when) nearby"
    }
}

/// The ways out of a filtered-to-nothing map.
private struct FilteredOutActions: View {
    let viewModel: MapViewModel
    let hiddenByTime: Bool
    let hiddenByQuickFilters: Bool
    let hiddenKinds: Set<MapCluster.Kind>

    var body: some View {
        VStack(spacing: 8) {
            if hiddenByTime {
                Button("Show all times") { viewModel.timeChip = .anytime }
                    .buttonStyle(.borderedProminent)
                    .minHitTarget()
            }
            if hiddenByQuickFilters {
                Button("Clear Open now and Walkable") {
                    viewModel.openNowOnly = false
                    viewModel.walkableOnly = false
                }
                .buttonStyle(.bordered)
                .minHitTarget()
            }
            if hiddenKinds.contains(.event) {
                Button("Turn on Events") { viewModel.showEvents = true }
                    .buttonStyle(.bordered)
                    .minHitTarget()
            }
            if hiddenKinds.contains(.restaurant) {
                Button("Turn on Dining") { viewModel.showRestaurants = true }
                    .buttonStyle(.bordered)
                    .minHitTarget()
            }
            if hiddenKinds.contains(.attraction) {
                Button("Turn on Places") { viewModel.showAttractions = true }
                    .buttonStyle(.bordered)
                    .minHitTarget()
            }
        }
    }
}

/// Icon, message and actions on a material card.
struct MapMessageCard<Actions: View>: View {
    let icon: String
    let message: String
    @ViewBuilder let actions: () -> Actions

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.largeTitle)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(message)
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            actions()
        }
        .padding(20)
        .background(.ultraThickMaterial, in: RoundedRectangle(cornerRadius: 16))
        .shadow(radius: 8)
        .padding(.horizontal, 32)
        .accessibilityElement(children: .contain)
    }
}

/// The list alternative to the map (IOS-DD-MAP-12): the same filtered places
/// as rows, nearest first. The default when VoiceOver is running, since a
/// map of unlabelled circles was the only way to browse.
struct MapListView: View {
    let viewModel: MapViewModel

    var body: some View {
        List(viewModel.listItems) { item in
            NavigationLink(value: item.destination) {
                ContentCard(item.cardData, variant: .listRow, decorative: true)
            }
            .accessibilityLabel(item.accessibilityLabel)
        }
        .listStyle(.plain)
    }
}
