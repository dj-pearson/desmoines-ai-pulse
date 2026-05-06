import SwiftUI

/// Main home/feed view with featured events, popular restaurants, smart
/// presets, inline filter pills, and event list.
struct HomeView: View {
    @State private var viewModel = EventsViewModel()
    @State private var restaurantsVM = RestaurantsViewModel()
    @State private var navigationPath = NavigationPath()
    @State private var toast: ToastMessage?
    @State private var showScrollToTop = false
    @State private var showDiscover = false
    @State private var showAskPulse = false
    /// Optional override applied when the user opens DiscoverView via the
    /// "Right Now" ribbon (IOS-DISCOVER-2026-005). Cleared after the sheet
    /// is presented so subsequent toolbar Swipe taps go back to the
    /// derived-from-filters context.
    @State private var ribbonDiscoverContext: (DiscoverFilterContext, DiscoverMode)?

    var body: some View {
        NavigationStack(path: $navigationPath) {
            ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 0) {
                    Color.clear.frame(height: 0).id("top")
                    headerSection

                    // Right Now ribbon — weather-aware contextual entry
                    RightNowRibbon { ctx, mode in
                        ribbonDiscoverContext = (ctx, mode)
                        showDiscover = true
                    }
                    .padding(.horizontal)
                    .padding(.top, 10)

                    // Ask Pulse entry — primary AI discovery surface
                    askPulseEntryBar
                        .padding(.horizontal)
                        .padding(.top, 10)

                    discoverHeroCard
                        .padding(.horizontal)
                        .padding(.top, 10)

                    exploreAttractionsCard
                        .padding(.horizontal)
                        .padding(.top, 10)

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
                    AdSlot(.feed)

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
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    sortMenu
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        showDiscover = true
                    } label: {
                        Label("Swipe", systemImage: "rectangle.stack.fill")
                            .font(.subheadline.weight(.semibold))
                    }
                    .accessibilityLabel("Open swipe discovery")
                }
            }
            .fullScreenCover(isPresented: $showDiscover, onDismiss: { ribbonDiscoverContext = nil }) {
                let override = ribbonDiscoverContext
                DiscoverView(
                    initialFilter: override?.0 ?? discoverFilterFromEvents(),
                    initialMode: override?.1 ?? .events,
                    lockMode: override == nil && viewModel.activeFilterCount > 0,
                    onClose: { showDiscover = false }
                )
            }
            .sheet(isPresented: $showAskPulse) {
                AskPulseView()
            }
            .navigationDestination(for: Event.self) { event in
                EventDetailView(event: event)
            }
            .navigationDestination(for: Restaurant.self) { restaurant in
                RestaurantDetailView(restaurant: restaurant)
            }
            .navigationDestination(for: Attraction.self) { attraction in
                AttractionDetailView(attraction: attraction)
            }
            .navigationDestination(for: HomeDestination.self) { destination in
                switch destination {
                case .attractions: AttractionsView()
                }
            }
            .task {
                async let eventsLoad: () = viewModel.loadInitialData()
                async let restaurantsLoad: () = restaurantsVM.loadInitialData()
                _ = await (eventsLoad, restaurantsLoad)
            }
            .toastOverlay(message: $toast)
        }
    }

    // MARK: - Discover Hero Card

    /// Top-of-feed CTA into the swipe-to-discover deck. Mirrors the
    /// Explore Attractions card's structure so the home feed reads as a
    /// row of CTAs above the smart presets.
    // MARK: - Sort Menu (IOS-DISCOVER-2026-003)

    /// Sort menu for the events list. Mirrors RestaurantsView.sortMenu so
    /// the Events tab matches the Restaurants tab UX.
    private var sortMenu: some View {
        Menu {
            ForEach(EventSortOption.allCases) { option in
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    viewModel.sortBy = option
                } label: {
                    if viewModel.sortBy == option {
                        Label(option.rawValue, systemImage: "checkmark")
                    } else {
                        Text(option.rawValue)
                    }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "arrow.up.arrow.down")
                    .font(.system(size: 14, weight: .semibold))
                Text(viewModel.sortBy.rawValue)
                    .font(.subheadline.weight(.medium))
            }
        }
        .accessibilityLabel("Sort: \(viewModel.sortBy.rawValue)")
    }

    // MARK: - Ask Pulse Entry

    /// Search-bar-styled CTA that opens AskPulseView. Sits above the swipe
    /// hero so it reads as the primary discovery entry. Implements the
    /// iOS half of IOS-DISCOVER-2026-001.
    private var askPulseEntryBar: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            showAskPulse = true
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "sparkles")
                    .foregroundStyle(.tint)
                    .accessibilityHidden(true)
                Text("Ask Pulse — date night, walkable, under $60…")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer()
                Image(systemName: "arrow.up.right.circle.fill")
                    .foregroundStyle(.tint)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color(.secondarySystemGroupedBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color.accentColor.opacity(0.25), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Ask Pulse — describe what you're looking for and get curated picks")
        .accessibilityHint("Opens the conversational discovery view")
    }

    private var discoverHeroCard: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            showDiscover = true
        } label: {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 14)
                        .fill(PremiumTokens.brandGradient)
                        .frame(width: 56, height: 56)
                    Image(systemName: "rectangle.stack.fill")
                        .font(.title)
                        .foregroundStyle(.white)
                }

                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text("Swipe to Discover")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                        Text("NEW")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.pink, in: Capsule())
                    }
                    Text("Don't know what to do tonight? Swipe through hand-picked events and dining.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }

                Spacer(minLength: 0)

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color(.systemBackground))
                    .shadow(color: .black.opacity(0.06), radius: 8, x: 0, y: 2)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .strokeBorder(
                        LinearGradient(colors: [.purple.opacity(0.4), .blue.opacity(0.4)],
                                       startPoint: .topLeading, endPoint: .bottomTrailing),
                        lineWidth: 1
                    )
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Swipe to discover. Don't know what to do tonight? Swipe through hand-picked events and dining.")
        .accessibilityHint("Opens the swipe discovery deck")
    }

    /// Snapshot the events viewmodel's filter state into a DiscoverFilterContext
    /// so a user who's filtered the home feed (e.g. category=Music) gets their
    /// filter carried into the swipe deck.
    private func discoverFilterFromEvents() -> DiscoverFilterContext {
        var f = DiscoverFilterContext()
        f.eventCategory = viewModel.selectedCategory
        f.datePreset = viewModel.selectedDatePreset
        f.freeOnly = viewModel.showFreeOnly
        f.locations = Array(viewModel.selectedCities)
        return f
    }

    // MARK: - Explore Attractions Entry Point

    /// Primary entry point to the Attractions browse screen. Tab bar is already
    /// at 6 items on iPhone, so Attractions lives here as an "Explore" CTA on
    /// the Home tab rather than a 7th tab.
    private var exploreAttractionsCard: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            navigationPath.append(HomeDestination.attractions)
        } label: {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(
                            LinearGradient(
                                colors: [Color.purple.opacity(0.85), Color.pink.opacity(0.7)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 56, height: 56)

                    Image(systemName: "star.circle.fill")
                        .font(.title)
                        .foregroundStyle(.white)
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text("Explore Attractions")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                    Text("Museums, parks, and must-see places")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .padding(12)
            .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Explore attractions. Museums, parks, and must-see places.")
        .accessibilityHint("Opens the attractions browse screen")
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
                        FilterChipView(
                            text: category.displayName,
                            icon: category.icon,
                            tint: category.color
                        ) { viewModel.selectedCategory = nil }
                    }
                    if let preset = viewModel.selectedDatePreset {
                        FilterChipView(text: preset.rawValue, icon: "calendar") {
                            viewModel.selectedDatePreset = nil
                        }
                    }
                    if viewModel.showFreeOnly {
                        FilterChipView(text: "Free", icon: "ticket.fill", tint: .green) {
                            viewModel.showFreeOnly = false
                        }
                    }
                    if viewModel.showFeaturedOnly {
                        FilterChipView(text: "Featured", icon: "star.fill", tint: .orange) {
                            viewModel.showFeaturedOnly = false
                        }
                    }
                    ForEach(Array(viewModel.selectedCities).sorted(), id: \.self) { city in
                        FilterChipView(text: city, icon: "mappin.and.ellipse") {
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
                        .buttonStyle(.pressableCard)
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
            // Image with scrim for legibility
            ZStack(alignment: .bottomLeading) {
                CachedAsyncImage(url: event.imageUrl) {
                    Rectangle()
                        .fill(event.eventCategory.color.gradient)
                }
                .frame(width: 260, height: 150)
                .overlay(PremiumTokens.imageScrim)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .glassCard(cornerRadius: 14, material: .regularMaterial, elevation: PremiumTokens.elevation4)

                // Category badge
                CategoryBadge(category: event.eventCategory)
                    .padding(10)
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

// MARK: - Navigation

/// Typed destinations for navigationPath.append(). Keeps the Home tab's
/// internal navigation separate from content-type destinations (Event,
/// Restaurant, Attraction) which each have their own navigationDestination.
enum HomeDestination: Hashable {
    case attractions
}

#Preview {
    HomeView()
}
