import SwiftUI

/// Runs a saved search and lists the matching events/restaurants/attractions
/// (IOS-PARITY-008). This is where an alert push deep-links — straight to the
/// filtered results.
struct SavedSearchResultsView: View {
    let savedSearch: SavedSearch

    @State private var viewModel = SearchViewModel()

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                if viewModel.isSearching {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if viewModel.isEmpty {
                    EmptyStateView(
                        icon: "magnifyingglass",
                        title: "No matches right now",
                        message: "Nothing matches “\(savedSearch.query)” yet. We'll alert you when something does."
                    )
                    .padding(.top, 40)
                } else {
                    group("Events", viewModel.eventResults) { ContentCard($0.cardData, variant: .listRow) }
                    group("Restaurants", viewModel.restaurantResults) { ContentCard($0.cardData, variant: .listRow) }
                    group("Attractions", viewModel.attractionResults) { ContentCard($0.cardData, variant: .listRow) }
                }
            }
            .padding()
        }
        .navigationTitle(savedSearch.name)
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: Event.self) { EventDetailView(event: $0) }
        .navigationDestination(for: Restaurant.self) { RestaurantDetailView(restaurant: $0) }
        .navigationDestination(for: Attraction.self) { AttractionDetailView(attraction: $0) }
        .task { viewModel.searchText = savedSearch.query }
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
