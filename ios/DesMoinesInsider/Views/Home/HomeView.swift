import SwiftUI

/// Main home/feed view. Content-first layout (IOS-IA-001):
///
/// 1. Right Now ribbon (weather-aware contextual entry)
/// 2. A single compact "Ways to explore" row (Ask Pulse / Swipe / Surprise /
///    Explore) — replaces the four full-width CTA cards that used to push real
///    content below the fold.
/// 3. Smart presets + inline filter pills
/// 4. Data-driven content rails (`HomeRailsView`) with interleaved ad slots
/// 5. The main, paginated events list
///
/// The rail order is data-driven so IOS-IA-006 can personalize the sequence
/// without touching layout. Each rail owns its own loading/empty state, so a
/// slow source never blocks the rest of the feed.
struct HomeView: View {
    @State private var viewModel = EventsViewModel()
    @State private var restaurantsVM = RestaurantsViewModel()
    @State private var attractionsVM = AttractionsViewModel()
    /// Dedicated VM for the "This Weekend" rail so its date-scoped query is
    /// independent of the user's filtering on the main events feed.
    @State private var weekendVM = EventsViewModel()
    @State private var navigationPath = NavigationPath()
    @State private var toast: ToastMessage?
    @State private var showScrollToTop = false
    @State private var showDiscover = false
    @State private var showAskPulse = false
    @State private var showSurpriseMe = false
    /// IOS-PARITY-001 — Home entry point into the native Trip Planner.
    @State private var showTripPlanner = false
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

                    // Consolidated discovery entry points — one compact row
                    // instead of four stacked full-width cards.
                    WaysToExploreRow(
                        onAskPulse: { showAskPulse = true },
                        onSwipe: { showDiscover = true },
                        onSurprise: { showSurpriseMe = true }
                    )
                    .padding(.top, 12)

                    // Trip Planner Home entry point (IOS-PARITY-001).
                    TripPlannerHomeCard { showTripPlanner = true }
                        .padding(.horizontal)
                        .padding(.top, 10)

                    // Smart Presets — one-tap event scenarios
                    EventSmartPresets(viewModel: viewModel)
                        .padding(.top, 10)

                    // Inline filter pills — always visible, no hidden sheet
                    EventInlineFilters(viewModel: viewModel)
                        .padding(.top, 2)

                    // Stale-data error note (feed has content but a refresh failed);
                    // the empty+error case is handled by eventsList's ErrorStateView.
                    if let error = viewModel.errorMessage, !viewModel.events.isEmpty {
                        errorBanner(error)
                    }

                    // Data-driven content rails with interleaved ad slots.
                    // Hidden while the user is actively filtering so the feed
                    // collapses to just their filtered results.
                    if viewModel.activeFilterCount == 0 {
                        HomeRailsView(
                            eventsVM: viewModel,
                            restaurantsVM: restaurantsVM,
                            attractionsVM: attractionsVM,
                            weekendVM: weekendVM,
                            onSeeAll: handleSeeAll,
                            order: HomeRailOrdering.current()
                        )
                    }

                    eventsList
                }
                .trackScrollOffset(showScrollToTop: $showScrollToTop)
            }
            .scrollOffsetCoordinateSpace()
            .overlay(alignment: .bottomTrailing) {
                ScrollToTopButton(isVisible: showScrollToTop) {
                    withAnimation { proxy.scrollTo("top") }
                }
            }
            // Home is a content-first feed (IOS-IA-001), so the discovery
            // controls (presets, filter pills) stay in-flow. What pins under the
            // nav title is the sticky search (.searchable below) plus — once the
            // user is actively filtering — the removable active-filter chips, so
            // they can review/clear filters without scrolling back up (IOS-IA-004).
            .safeAreaInset(edge: .top, spacing: 0) {
                if viewModel.activeFilterCount > 0 {
                    StickyFilterBar { activeFiltersBar }
                }
            }
            } // ScrollViewReader
            .refreshable {
                async let eventsRefresh: () = viewModel.refresh()
                async let restaurantsRefresh: () = restaurantsVM.refresh()
                async let attractionsRefresh: () = attractionsVM.refresh()
                async let weekendRefresh: () = weekendVM.refresh()
                _ = await (eventsRefresh, restaurantsRefresh, attractionsRefresh, weekendRefresh)
                if viewModel.errorMessage == nil {
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                } else {
                    UINotificationFeedbackGenerator().notificationOccurred(.error)
                }
            }
            .navigationTitle("Des Moines Insider")
            .navigationBarTitleDisplayMode(.large)
            .searchable(
                text: $viewModel.searchText,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: "Search events"
            )
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
            .fullScreenCover(isPresented: $showSurpriseMe) {
                SurpriseMeView()
            }
            .sheet(isPresented: $showTripPlanner) {
                TripPlannerView(showsCloseButton: true)
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
                case .discoverHub:
                    // Pushed within Home's NavigationStack, so the hub borrows
                    // this ambient stack rather than nesting its own.
                    DiscoverHubView(ownsNavigationStack: false)
                case .weekend:
                    // IOS-PARITY-004 — the dedicated This Weekend guide.
                    WeekendView(ownsNavigationStack: false)
                }
            }
            .task {
                async let eventsLoad: () = viewModel.loadInitialData()
                async let restaurantsLoad: () = restaurantsVM.loadInitialData()
                async let attractionsLoad: () = attractionsVM.loadInitialData()
                _ = await (eventsLoad, restaurantsLoad, attractionsLoad)
                // "This Weekend" rail — scope a separate VM to the weekend.
                if weekendVM.events.isEmpty {
                    weekendVM.selectedDatePreset = .thisWeekend
                }
                // IOS-PARITY-005 — warm the Best-Of winners cache so award
                // badges surface on cards across the app (fail-soft).
                await BestOfViewModel.refreshWinners()
            }
            .toastOverlay(message: $toast)
        }
    }

    // MARK: - See All routing

    /// Routes a rail's "See all" tap. Events-based rails reuse the Home tab's
    /// own list (applying the matching filter); cross-type rails push the
    /// relevant browse screen. When the native hubs land (IOS-PARITY-004 for
    /// Weekend), the .thisWeekend case will deep-link there instead.
    private func handleSeeAll(_ rail: HomeRail) {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        switch rail {
        case .featured:
            viewModel.showFeaturedOnly = true
        case .thisWeekend:
            // IOS-PARITY-004 — deep-link into the dedicated weekend guide
            // instead of just filtering the events list.
            navigationPath.append(HomeDestination.weekend)
        case .popularRestaurants, .trendingAttractions:
            navigationPath.append(HomeDestination.attractions)
        case .forYou:
            break
        }
    }

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
            } else if viewModel.events.isEmpty, let error = viewModel.errorMessage {
                // Genuine load error (online) — show the shared error/retry state
                // instead of a misleading "No Events Found" (UX-005).
                ErrorStateView(message: error) {
                    Task { await viewModel.refresh() }
                }
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
                    ForEach(Array(arrangedEvents.enumerated()), id: \.element.id) { index, event in
                        Button {
                            if event.isActivelySponsored {
                                AdTrackingService.shared.logSponsoredClick(listingType: "event", listingId: event.id)
                            }
                            navigationPath.append(event)
                        } label: {
                            EventCardView(event: event, toast: $toast)
                        }
                        .buttonStyle(.pressableCard)
                        .entranceAnimation(index: index)
                        .onAppear {
                            if event.isActivelySponsored {
                                AdTrackingService.shared.logSponsoredImpression(listingType: "event", listingId: event.id)
                            }
                        }
                        .task {
                            await viewModel.loadMoreIfNeeded(currentItem: event)
                        }

                        // Native in-feed ad card at deterministic indices
                        // (IOS-ADS-012). AdSlot renders nothing for subscribers.
                        if shouldInsertInFeedAd(after: index) {
                            AdSlot(.feed)
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

    /// Sponsored listings (IOS-ADS-011) pulled to the front of the main events
    /// feed; organic order is otherwise preserved.
    private var arrangedEvents: [Event] {
        SponsoredArranger.arrange(viewModel.events, isSponsored: { $0.isActivelySponsored })
    }

    /// Native in-feed ad cadence (IOS-ADS-012): the first ad appears after
    /// `inFeedFirstSlot` items, then every `inFeedInterval` thereafter. Indices
    /// come from the central AdConfig.
    private func shouldInsertInFeedAd(after index: Int) -> Bool {
        let position = index + 1
        guard position >= AdConfig.inFeedFirstSlot else { return false }
        return (position - AdConfig.inFeedFirstSlot) % AdConfig.inFeedInterval == 0
    }

}

// MARK: - Navigation

/// Typed destinations for navigationPath.append(). Keeps the Home tab's
/// internal navigation separate from content-type destinations (Event,
/// Restaurant, Attraction) which each have their own navigationDestination.
enum HomeDestination: Hashable {
    case attractions
    case discoverHub
    case weekend
}

#Preview {
    HomeView()
}
