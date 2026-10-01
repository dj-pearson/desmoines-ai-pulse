import SwiftUI

/// Runs a saved search and lists the matching events/restaurants/attractions
/// (IOS-PARITY-008). This is where an alert deep-links — straight to the
/// filtered results.
struct SavedSearchResultsView: View {
    let savedSearch: SavedSearch

    /// Saved-search re-runs are not the user typing, so they stay out of
    /// Recent (IOS-DD-SEARCH-04): `seedOnce()` turns `recordsHistory` off
    /// before the first search.
    @State private var viewModel = SearchViewModel()
    /// `.task` fires again on every reappear (Back from a detail). Seeding the
    /// search once keeps the results and the scroll position
    /// (IOS-DD-SEARCH-15).
    @State private var hasLoaded = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                content
            }
            .padding()
        }
        .refreshable { await viewModel.performSearchNow() }
        .navigationTitle(savedSearch.name)
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: Event.self) { EventDetailView(event: $0) }
        .navigationDestination(for: Restaurant.self) { RestaurantDetailView(restaurant: $0) }
        .navigationDestination(for: Attraction.self) { AttractionDetailView(attraction: $0) }
        .task { seedOnce() }
    }

    private var hasCriteria: Bool {
        !savedSearch.query.isEmpty || !savedSearch.structuredFilters.isEmpty
    }

    @ViewBuilder
    private var content: some View {
        if !hasCriteria {
            EmptyStateView(
                icon: "globe",
                title: "This search was saved on the web",
                message: "Open it on desmoinesinsider.com to see its filters."
            )
            .padding(.top, 40)
        } else if viewModel.isSearching && viewModel.totalResults == 0 {
            ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
        } else if viewModel.allFailed && viewModel.totalResults == 0 {
            EmptyStateView(
                icon: "exclamationmark.triangle",
                title: "Search isn't responding",
                message: "We couldn't load this saved search.",
                actionTitle: "Try again",
                action: { Task { await viewModel.performSearchNow() } }
            )
            .padding(.top, 40)
        } else if viewModel.isEmpty {
            EmptyStateView(
                icon: "magnifyingglass",
                title: "No matches right now",
                message: emptyMessage
            )
            .padding(.top, 40)
        } else {
            groups
        }
    }

    /// Alerts are promised only where the nightly email can deliver them
    /// (IOS-DD-SEARCH-10).
    private var emptyMessage: String {
        let base = savedSearch.query.isEmpty
            ? "Nothing matches this search yet."
            : "Nothing matches \"\(savedSearch.query)\" yet."
        guard savedSearch.isAlertEligible else { return base }
        return savedSearch.alertsEnabled
            ? base + " We'll email you when something new matches."
            : base + " Turn on alerts from your Dashboard to hear about new matches."
    }

    /// The tab the search was saved from goes first.
    @ViewBuilder
    private var groups: some View {
        ForEach(Self.groupOrder(savedTab: savedSearch.filters.tab), id: \.self) { tab in
            switch tab {
            case .events:
                group("Events", viewModel.eventResults) { ContentCard($0.cardData, variant: .listRow) }
            case .restaurants:
                group("Restaurants", viewModel.restaurantResults) { ContentCard($0.cardData, variant: .listRow) }
            case .attractions:
                group("Attractions", viewModel.attractionResults) { ContentCard($0.cardData, variant: .listRow) }
            }
        }
    }

    static func groupOrder(savedTab: String?) -> [SearchViewModel.SearchTab] {
        let all = SearchViewModel.SearchTab.allCases
        guard let first = all.first(where: { $0.rawValue == savedTab }),
              first != .events else { return all }
        return [first] + all.filter { $0 != first }
    }

    private func seedOnce() {
        guard !hasLoaded else { return }
        hasLoaded = true
        viewModel.recordsHistory = false
        viewModel.filters = savedSearch.structuredFilters
        viewModel.searchText = savedSearch.query
    }

    @ViewBuilder
    private func group<Item: Identifiable & Hashable, Card: View>(
        _ title: String,
        _ items: [Item],
        @ViewBuilder card: @escaping (Item) -> Card
    ) -> some View {
        if !items.isEmpty {
            Text(title).font(.title3.bold())
            ForEach(items) { item in
                NavigationLink(value: item) { card(item) }
                    .buttonStyle(.plain)
            }
        }
    }
}
