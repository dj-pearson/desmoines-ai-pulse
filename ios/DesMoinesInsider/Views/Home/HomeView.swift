import SwiftUI

/// Main home/feed view with featured events, popular restaurants, date presets, category filters, and event list.
struct HomeView: View {
    @State private var viewModel = EventsViewModel()
    @State private var restaurantsVM = RestaurantsViewModel()
    @State private var showFilters = false
    @State private var navigationPath = NavigationPath()
    @State private var toast: ToastMessage?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        NavigationStack(path: $navigationPath) {
            ScrollView {
                VStack(spacing: 0) {
                    headerSection
                    datePresetsSection
                    categoryChipsSection

                    // Error banner
                    if let error = viewModel.errorMessage {
                        errorBanner(error)
                    }

                    if !viewModel.featuredEvents.isEmpty {
                        featuredSection
                    }

                    // Popular Restaurants
                    if !restaurantsVM.restaurants.isEmpty {
                        restaurantsSection
                    }

                    activeFiltersBar
                    eventsList
                }
            }
            .refreshable {
                async let eventsRefresh: () = viewModel.refresh()
                async let restaurantsRefresh: () = restaurantsVM.refresh()
                _ = await (eventsRefresh, restaurantsRefresh)
            }
            .navigationTitle("Des Moines Insider")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    filterButton
                }
            }
            .sheet(isPresented: $showFilters) {
                FilterSheet(
                    selectedCategory: $viewModel.selectedCategory,
                    selectedDatePreset: $viewModel.selectedDatePreset,
                    showFeaturedOnly: $viewModel.showFeaturedOnly,
                    onClear: { viewModel.clearFilters() }
                )
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
            .navigationDestination(for: Event.self) { event in
                EventDetailView(event: event)
            }
            .navigationDestination(for: Restaurant.self) { restaurant in
                RestaurantDetailView(restaurant: restaurant)
            }
            .task {
                async let eventsLoad: () = viewModel.loadInitialData()
                async let restaurantsLoad: () = restaurantsVM.loadInitialData()
                _ = await (eventsLoad, restaurantsLoad)
            }
            .toastOverlay(message: $toast)
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("What's happening in Des Moines")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            if viewModel.totalCount > 0 {
                Text("\(viewModel.totalCount) upcoming events")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal)
        .padding(.top, 4)
    }

    // MARK: - Date Presets

    private var datePresetsSection: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(DateFilterPreset.allCases) { preset in
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        withAnimation(reduceMotion ? nil : .snappy) {
                            if viewModel.selectedDatePreset == preset {
                                viewModel.selectedDatePreset = nil
                            } else {
                                viewModel.selectedDatePreset = preset
                            }
                        }
                    } label: {
                        Text(preset.rawValue)
                            .font(.subheadline.weight(.medium))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(
                                viewModel.selectedDatePreset == preset
                                    ? Color.accentColor
                                    : Color(.systemGray6)
                            )
                            .foregroundStyle(
                                viewModel.selectedDatePreset == preset
                                    ? .white
                                    : .primary
                            )
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Filter by \(preset.rawValue)")
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 10)
        }
    }

    // MARK: - Category Chips

    private var categoryChipsSection: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(EventCategory.allCases.prefix(8)) { category in
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        withAnimation(reduceMotion ? nil : .snappy) {
                            if viewModel.selectedCategory == category {
                                viewModel.selectedCategory = nil
                            } else {
                                viewModel.selectedCategory = category
                            }
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: category.icon)
                                .font(.caption)
                            Text(category.displayName)
                                .font(.caption.weight(.medium))
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(
                            viewModel.selectedCategory == category
                                ? category.color.opacity(0.2)
                                : Color(.systemGray6)
                        )
                        .foregroundStyle(
                            viewModel.selectedCategory == category
                                ? category.color
                                : .secondary
                        )
                        .clipShape(Capsule())
                        .overlay(
                            Capsule()
                                .stroke(
                                    viewModel.selectedCategory == category
                                        ? category.color.opacity(0.3)
                                        : Color.clear,
                                    lineWidth: 1
                                )
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Filter by \(category.displayName)")
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 8)
        }
    }

    // MARK: - Featured Section

    private var featuredSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Featured", systemImage: "star.fill")
                    .font(.headline)
                    .foregroundStyle(.orange)
                Spacer()
            }
            .padding(.horizontal)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    ForEach(viewModel.featuredEvents) { event in
                        Button {
                            navigationPath.append(event)
                        } label: {
                            FeaturedEventCard(event: event)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal)
            }
        }
        .padding(.vertical, 8)
    }

    // MARK: - Popular Restaurants Section

    private var restaurantsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Popular Restaurants", systemImage: "fork.knife")
                    .font(.headline)
                    .foregroundStyle(.orange)
                Spacer()
            }
            .padding(.horizontal)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    ForEach(restaurantsVM.restaurants.prefix(10)) { restaurant in
                        Button {
                            navigationPath.append(restaurant)
                        } label: {
                            CompactRestaurantCard(restaurant: restaurant)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal)
            }
        }
        .padding(.vertical, 8)
    }

    // MARK: - Error Banner

    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.yellow)
            Text(message)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
            Spacer()
            Button {
                Task { await viewModel.refresh() }
            } label: {
                Text("Retry")
                    .font(.caption.bold())
                    .foregroundStyle(Color.accentColor)
            }
        }
        .padding(12)
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 10))
        .padding(.horizontal)
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Error: \(message). Tap retry to try again.")
    }

    // MARK: - Active Filters Bar

    @ViewBuilder
    private var activeFiltersBar: some View {
        if viewModel.activeFilterCount > 0 {
            HStack {
                Text("\(viewModel.activeFilterCount) filter\(viewModel.activeFilterCount > 1 ? "s" : "") active")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                Spacer()
                Button("Clear All") {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    withAnimation { viewModel.clearFilters() }
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.accentColor)
            }
            .padding(.horizontal)
            .padding(.vertical, 6)
        }
    }

    // MARK: - Events List

    private var eventsList: some View {
        Group {
            if viewModel.isLoading {
                ForEach(0..<6, id: \.self) { _ in
                    EventCardSkeleton()
                        .padding(.horizontal)
                        .padding(.vertical, 4)
                }
            } else if viewModel.events.isEmpty && !NetworkMonitor.shared.isConnected {
                EmptyStateView(
                    icon: "wifi.slash",
                    title: "You're Offline",
                    message: "Check your internet connection and try again.",
                    actionTitle: "Retry",
                    action: { Task { await viewModel.refresh() } }
                )
                .padding(.top, 40)
            } else if viewModel.events.isEmpty {
                EmptyStateView(
                    icon: "calendar.badge.exclamationmark",
                    title: "No Events Found",
                    message: "Try adjusting your filters or check back later.",
                    actionTitle: viewModel.activeFilterCount > 0 ? "Clear Filters" : nil,
                    action: { viewModel.clearFilters() }
                )
                .padding(.top, 40)
            } else {
                LazyVStack(spacing: 12) {
                    ForEach(viewModel.events) { event in
                        Button {
                            navigationPath.append(event)
                        } label: {
                            EventCardView(event: event, toast: $toast)
                        }
                        .buttonStyle(.plain)
                        .task {
                            await viewModel.loadMoreIfNeeded(currentItem: event)
                        }
                    }

                    if viewModel.isLoadingMore {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding()
                    }
                }
                .padding(.horizontal)
            }
        }
        .padding(.bottom, 20)
    }

    // MARK: - Filter Button

    private var filterButton: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            showFilters = true
        } label: {
            ZStack(alignment: .topTrailing) {
                Image(systemName: "line.3.horizontal.decrease.circle")
                    .font(.title3)

                if viewModel.activeFilterCount > 0 {
                    Text("\(viewModel.activeFilterCount)")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 16, height: 16)
                        .background(Color.red, in: Circle())
                        .offset(x: 4, y: -4)
                }
            }
        }
        .accessibilityLabel("Filters")
        .accessibilityHint(viewModel.activeFilterCount > 0 ? "\(viewModel.activeFilterCount) active" : "No active filters")
    }
}

// MARK: - Compact Restaurant Card (for home feed horizontal scroll)

private struct CompactRestaurantCard: View {
    let restaurant: Restaurant

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            CachedAsyncImage(url: restaurant.imageUrl) {
                ZStack {
                    Rectangle().fill(Color.orange.opacity(0.15).gradient)
                    Image(systemName: "fork.knife")
                        .font(.title2)
                        .foregroundStyle(.orange.opacity(0.3))
                }
            }
            .frame(width: 180, height: 110)
            .clipShape(RoundedRectangle(cornerRadius: 12))

            Text(restaurant.name)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)

            HStack(spacing: 6) {
                if let cuisine = restaurant.cuisine {
                    Text(cuisine)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let price = restaurant.priceRange {
                    Text(price)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.green)
                }

                Spacer()

                if let rating = restaurant.rating {
                    HStack(spacing: 2) {
                        Image(systemName: "star.fill")
                            .font(.caption2)
                            .foregroundStyle(.yellow)
                        Text(String(format: "%.1f", rating))
                            .font(.caption2.weight(.medium))
                    }
                }
            }
        }
        .frame(width: 180)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(restaurant.name), \(restaurant.cuisine ?? "restaurant"), rated \(restaurant.ratingText)")
    }
}

// MARK: - Featured Event Card

private struct FeaturedEventCard: View {
    let event: Event

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Image
            ZStack(alignment: .bottomLeading) {
                CachedAsyncImage(url: event.imageUrl) {
                    Rectangle()
                        .fill(event.eventCategory.color.gradient)
                }
                .frame(width: 260, height: 150)
                .clipShape(RoundedRectangle(cornerRadius: 12))

                // Category badge
                CategoryBadge(category: event.eventCategory)
                    .padding(8)
            }

            // Title
            Text(event.title)
                .font(.subheadline.weight(.semibold))
                .lineLimit(2)
                .multilineTextAlignment(.leading)

            // Date & Location
            HStack(spacing: 4) {
                if let date = event.parsedDate {
                    Image(systemName: "calendar")
                        .font(.caption2)
                    Text(date.formatted(.dateTime.month(.abbreviated).day()))
                        .font(.caption)
                }

                Spacer()

                if event.isFree {
                    Text("FREE")
                        .font(.caption2.bold())
                        .foregroundStyle(.green)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.green.opacity(0.15), in: Capsule())
                }
            }
            .foregroundStyle(.secondary)
        }
        .frame(width: 260)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(event.title), \(event.eventCategory.displayName)")
    }
}

// MARK: - Skeleton

private struct EventCardSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemGray5))
                .frame(height: 160)

            RoundedRectangle(cornerRadius: 4)
                .fill(Color(.systemGray5))
                .frame(height: 18)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.trailing, 40)

            RoundedRectangle(cornerRadius: 4)
                .fill(Color(.systemGray6))
                .frame(height: 14)
                .frame(maxWidth: 200, alignment: .leading)
        }
        .redacted(reason: .placeholder)
        .shimmer()
    }
}

#Preview {
    HomeView()
}
