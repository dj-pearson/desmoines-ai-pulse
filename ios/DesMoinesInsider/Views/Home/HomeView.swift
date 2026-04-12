import SwiftUI

/// Main home/feed view with featured events, popular restaurants, smart
/// presets, inline filter pills, and event list.
struct HomeView: View {
    @State private var viewModel = EventsViewModel()
    @State private var restaurantsVM = RestaurantsViewModel()
    @State private var navigationPath = NavigationPath()
    @State private var toast: ToastMessage?
    @State private var showScrollToTop = false

    var body: some View {
        NavigationStack(path: $navigationPath) {
            ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 0) {
                    Color.clear.frame(height: 0).id("top")
                    headerSection

                    // Smart Presets — one-tap event scenarios
                    EventSmartPresets(viewModel: viewModel)
                        .padding(.top, 6)

                    // Inline filter pills — always visible, no hidden sheet
                    EventInlineFilters(viewModel: viewModel)
                        .padding(.top, 2)

                    // Error banner
                    if let error = viewModel.errorMessage {
                        errorBanner(error)
                    }

                    if !viewModel.featuredEvents.isEmpty {
                        featuredSection
                    }

                    // Ad banner for free users (hidden for subscribers — ad-free experience)
                    AdBannerView()
                        .padding(.horizontal)
                        .padding(.vertical, 4)

                    // Popular Restaurants
                    if !restaurantsVM.restaurants.isEmpty {
                        restaurantsSection
                    }

                    activeFiltersBar
                    eventsList
                }
                .trackScrollOffset(showScrollToTop: $showScrollToTop)
            }
            .coordinateSpace(name: "scroll")
            .overlay(alignment: .bottomTrailing) {
                ScrollToTopButton(isVisible: showScrollToTop) {
                    withAnimation { proxy.scrollTo("top") }
                }
            }
            } // ScrollViewReader
            .refreshable {
                async let eventsRefresh: () = viewModel.refresh()
                async let restaurantsRefresh: () = restaurantsVM.refresh()
                _ = await (eventsRefresh, restaurantsRefresh)
                if viewModel.errorMessage == nil {
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                } else {
                    UINotificationFeedbackGenerator().notificationOccurred(.error)
                }
            }
            .navigationTitle("Des Moines Insider")
            .navigationBarTitleDisplayMode(.large)
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
                        .accessibilityLabel(event.featuredCardAccessibilityLabel)
                        .accessibilityHint("Double-tap to view event details")
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
                        .accessibilityLabel(restaurant.compactCardAccessibilityLabel)
                        .accessibilityHint("Double-tap to view restaurant details")
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

    // MARK: - Active Filter Chips (individually removable)

    @ViewBuilder
    private var activeFiltersBar: some View {
        if viewModel.activeFilterCount > 0 {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    Text("\(viewModel.events.count) results")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)

                    if let category = viewModel.selectedCategory {
                        chip(category.displayName, icon: category.icon, tint: category.color) {
                            viewModel.selectedCategory = nil
                        }
                    }
                    if let preset = viewModel.selectedDatePreset {
                        chip(preset.rawValue, icon: "calendar") {
                            viewModel.selectedDatePreset = nil
                        }
                    }
                    if viewModel.showFreeOnly {
                        chip("Free", icon: "ticket.fill", tint: .green) {
                            viewModel.showFreeOnly = false
                        }
                    }
                    if viewModel.showFeaturedOnly {
                        chip("Featured", icon: "star.fill", tint: .orange) {
                            viewModel.showFeaturedOnly = false
                        }
                    }
                    ForEach(Array(viewModel.selectedCities).sorted(), id: \.self) { city in
                        chip(city, icon: "mappin.and.ellipse") {
                            viewModel.selectedCities.remove(city)
                        }
                    }

                    Button("Clear all") {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        withAnimation { viewModel.clearFilters() }
                    }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.red)
                    .padding(.horizontal, 4)
                }
                .padding(.horizontal)
                .padding(.vertical, 4)
            }
        }
    }

    private func chip(
        _ text: String,
        icon: String,
        tint: Color = .accentColor,
        onRemove: @escaping () -> Void
    ) -> some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            onRemove()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: icon).font(.system(size: 10))
                Text(text).font(.caption.weight(.medium)).lineLimit(1)
                Image(systemName: "xmark").font(.system(size: 9, weight: .bold))
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .foregroundStyle(tint)
            .background(tint.opacity(0.12), in: Capsule())
            .overlay(Capsule().strokeBorder(tint.opacity(0.3), lineWidth: 0.5))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Remove filter: \(text)")
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
                    ForEach(Array(viewModel.events.enumerated()), id: \.element.id) { index, event in
                        Button {
                            navigationPath.append(event)
                        } label: {
                            EventCardView(event: event, toast: $toast)
                        }
                        .buttonStyle(.plain)
                        .entranceAnimation(index: index)
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
        // Suppress redundant child reads — full label set on the Button wrapper above
        .accessibilityElement(children: .ignore)
        .accessibilityHidden(true)
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
                    // Uses icon + text so colour alone is not the only differentiator
                    Label("FREE", systemImage: "ticket")
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
        // Suppress redundant child reads — full label set on the Button wrapper above
        .accessibilityElement(children: .ignore)
        .accessibilityHidden(true)
    }
}

// MARK: - Skeleton (matches EventCardView layout)

private struct EventCardSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Image area with overlays
            ZStack(alignment: .topTrailing) {
                RoundedRectangle(cornerRadius: 0)
                    .fill(Color(.systemGray5))
                    .frame(height: 180)

                VStack(alignment: .trailing, spacing: 6) {
                    // Favorite button placeholder
                    Circle()
                        .fill(Color(.systemGray4))
                        .frame(width: 36, height: 36)

                    Spacer()

                    // Date badge placeholder
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color(.systemGray4))
                        .frame(width: 48, height: 52)
                }
                .padding(10)

                // Category badge placeholder
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color(.systemGray4))
                    .frame(width: 70, height: 22)
                    .position(x: 60, y: 14)
            }

            // Content area
            VStack(alignment: .leading, spacing: 8) {
                // Title
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(.systemGray5))
                    .frame(height: 18)
                    .padding(.trailing, 40)

                // Time row
                HStack(spacing: 6) {
                    Circle()
                        .fill(Color(.systemGray6))
                        .frame(width: 12, height: 12)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemGray6))
                        .frame(width: 160, height: 12)
                }

                // Location row
                HStack(spacing: 6) {
                    Circle()
                        .fill(Color(.systemGray6))
                        .frame(width: 12, height: 12)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemGray6))
                        .frame(width: 120, height: 12)
                }

                // Price badge
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color(.systemGray6))
                    .frame(width: 60, height: 22)
            }
            .padding(14)
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.08), radius: 8, x: 0, y: 2)
        .redacted(reason: .placeholder)
        .shimmer()
    }
}

#Preview {
    HomeView()
}
