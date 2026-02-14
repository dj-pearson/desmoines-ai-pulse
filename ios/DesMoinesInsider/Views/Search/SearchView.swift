import SwiftUI

/// Unified search across events, restaurants, and attractions.
struct SearchView: View {
    @State private var viewModel = SearchViewModel()
    @State private var navigationPath = NavigationPath()

    var body: some View {
        NavigationStack(path: $navigationPath) {
            VStack(spacing: 0) {
                // Tab picker
                if viewModel.hasSearched {
                    tabPicker
                }

                // Content
                if viewModel.searchText.isEmpty && !viewModel.hasSearched {
                    searchSuggestions
                } else if viewModel.isSearching {
                    loadingView
                } else if viewModel.isEmpty {
                    EmptyStateView(
                        icon: "magnifyingglass",
                        title: "No Results",
                        message: "Try a different search term.",
                        actionTitle: "Clear",
                        action: { viewModel.clearSearch() }
                    )
                } else {
                    resultsList
                }
            }
            .searchable(text: $viewModel.searchText, prompt: "Search events, restaurants, attractions...")
            .navigationTitle("Search")
            .navigationDestination(for: Event.self) { event in
                EventDetailView(event: event)
            }
            .navigationDestination(for: Restaurant.self) { restaurant in
                RestaurantDetailView(restaurant: restaurant)
            }
            .navigationDestination(for: Attraction.self) { attraction in
                AttractionDetailView(attraction: attraction)
            }
        }
    }

    // MARK: - Tab Picker

    private var tabPicker: some View {
        HStack(spacing: 0) {
            ForEach(SearchViewModel.SearchTab.allCases) { tab in
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    withAnimation(.snappy) { viewModel.selectedTab = tab }
                } label: {
                    VStack(spacing: 6) {
                        HStack(spacing: 4) {
                            Image(systemName: tab.icon)
                                .font(.caption2)
                            Text(tab.rawValue)
                                .font(.subheadline.weight(.medium))

                            let count = countFor(tab)
                            if count > 0 {
                                Text("\(count)")
                                    .font(.caption2.weight(.bold))
                                    .padding(.horizontal, 5)
                                    .padding(.vertical, 1)
                                    .background(
                                        viewModel.selectedTab == tab
                                            ? Color.accentColor
                                            : Color(.systemGray5),
                                        in: Capsule()
                                    )
                                    .foregroundStyle(
                                        viewModel.selectedTab == tab ? .white : .secondary
                                    )
                            }
                        }

                        Rectangle()
                            .fill(viewModel.selectedTab == tab ? Color.accentColor : Color.clear)
                            .frame(height: 2)
                    }
                }
                .foregroundStyle(viewModel.selectedTab == tab ? .primary : .secondary)
                .frame(maxWidth: .infinity)
                .accessibilityLabel("\(tab.rawValue), \(countFor(tab)) results")
            }
        }
        .padding(.horizontal)
        .padding(.top, 8)
    }

    // MARK: - Search Suggestions

    private var searchSuggestions: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Quick categories
                VStack(alignment: .leading, spacing: 12) {
                    Text("Popular Categories")
                        .font(.headline)
                        .padding(.horizontal)

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 10)], spacing: 10) {
                        ForEach(EventCategory.allCases.prefix(8)) { category in
                            Button {
                                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                viewModel.searchText = category.displayName
                            } label: {
                                VStack(spacing: 8) {
                                    Image(systemName: category.icon)
                                        .font(.title2)
                                        .foregroundStyle(category.color)
                                    Text(category.displayName)
                                        .font(.caption.weight(.medium))
                                        .foregroundStyle(.primary)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 12))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Search \(category.displayName)")
                        }
                    }
                    .padding(.horizontal)
                }

                // Quick searches
                VStack(alignment: .leading, spacing: 10) {
                    Text("Try Searching")
                        .font(.headline)
                        .padding(.horizontal)

                    ForEach(["Live music tonight", "Family friendly", "Free events", "Downtown restaurants", "Outdoor activities"], id: \.self) { suggestion in
                        Button {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            viewModel.searchText = suggestion
                        } label: {
                            HStack {
                                Image(systemName: "magnifyingglass")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Text(suggestion)
                                    .font(.subheadline)
                                Spacer()
                                Image(systemName: "arrow.up.left")
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                            }
                            .padding(.horizontal)
                            .padding(.vertical, 10)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.top, 20)
        }
    }

    // MARK: - Results List

    private var resultsList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                switch viewModel.selectedTab {
                case .events:
                    ForEach(viewModel.eventResults) { event in
                        Button {
                            navigationPath.append(event)
                        } label: {
                            EventCardView(event: event)
                        }
                        .buttonStyle(.plain)
                    }

                case .restaurants:
                    ForEach(viewModel.restaurantResults) { restaurant in
                        Button {
                            navigationPath.append(restaurant)
                        } label: {
                            RestaurantCardView(restaurant: restaurant)
                        }
                        .buttonStyle(.plain)
                    }

                case .attractions:
                    ForEach(viewModel.attractionResults) { attraction in
                        Button {
                            navigationPath.append(attraction)
                        } label: {
                            AttractionCardView(attraction: attraction)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding()
        }
    }

    // MARK: - Loading

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
            Text("Searching...")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Helpers

    private func countFor(_ tab: SearchViewModel.SearchTab) -> Int {
        switch tab {
        case .events: return viewModel.eventResults.count
        case .restaurants: return viewModel.restaurantResults.count
        case .attractions: return viewModel.attractionResults.count
        }
    }
}

// MARK: - Attraction Card (used in search results)

struct AttractionCardView: View {
    let attraction: Attraction

    var body: some View {
        HStack(spacing: 14) {
            CachedAsyncImage(url: attraction.imageUrl) {
                ZStack {
                    Rectangle().fill(Color.teal.opacity(0.1))
                    Image(systemName: attraction.attractionType.icon)
                        .foregroundStyle(.teal.opacity(0.4))
                }
            }
            .frame(width: 80, height: 80)
            .clipShape(RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 4) {
                Text(attraction.name)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)

                HStack(spacing: 6) {
                    Label(attraction.type, systemImage: attraction.attractionType.icon)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let rating = attraction.rating {
                    HStack(spacing: 3) {
                        Image(systemName: "star.fill")
                            .font(.caption2)
                            .foregroundStyle(.yellow)
                        Text(String(format: "%.1f", rating))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }

                if let location = attraction.location {
                    Text(location)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                }
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .padding(10)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.05), radius: 4, x: 0, y: 1)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(attraction.name), \(attraction.type)")
    }
}

#Preview {
    SearchView()
}
