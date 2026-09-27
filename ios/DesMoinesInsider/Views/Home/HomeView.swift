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
    /// independent of the user's filtering on the main events feed. Starts on
    /// its window, so its first load is the weekend rather than the whole feed
    /// (IOS-DD-EVENTS-12).
    @State private var weekendVM = EventsViewModel(initialDatePreset: .thisWeekend, loadsFeatured: false)
    /// The Tonight rail (IOS-DD-EVENTS-18), built the same way.
    @State private var tonightVM = EventsViewModel(initialDatePreset: .tonight, loadsFeatured: false)
    /// Rail order, recomputed on appear and on return to the foreground only.
    /// It used to be computed in `body` from observable favorites and recents,
    /// so saving an event reordered the rails under the user's thumb
    /// (IOS-DD-EVENTS-11).
    @State private var railOrder: [HomeRail] = HomeRail.allCases
    @Environment(\.scenePhase) private var scenePhase
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

                    // While searching, results come straight under the search
                    // field instead of below five screens of discovery chrome,
                    // most of it behind the keyboard (IOS-DD-EVENTS-11).
                    if !isSearching {
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
                    }

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
                            tonightVM: tonightVM,
                            onSeeAll: handleSeeAll,
                            order: railOrder
                        )
                    }

                    // The main list had no heading, so it read as one more
                    // rail's overflow.
                    if !isSearching && viewModel.activeFilterCount == 0 && !viewModel.events.isEmpty {
                        Text("All upcoming events")
                            .font(.headline)
                            .accessibilityAddTraits(.isHeader)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal)
                            .padding(.top, 12)
                            .padding(.bottom, 4)
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
                async let restaurantsRefresh: Bool = restaurantsVM.refresh()
                async let attractionsRefresh: () = attractionsVM.refresh()
                async let weekendRefresh: () = weekendVM.refresh()
                async let tonightRefresh: () = tonightVM.refresh()
                _ = await (eventsRefresh, restaurantsRefresh, attractionsRefresh, weekendRefresh, tonightRefresh)
                // errorMessage is now set on every failure, not only when the
                // list was empty, so this haptic tells the truth
                // (IOS-DD-EVENTS-09).
                if viewModel.errorMessage == nil {
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                } else {
                    UINotificationFeedbackGenerator().notificationOccurred(.error)
                }
            }
            // Also after an offline launch served stale cache: those rows were
            // never replaced (IOS-DD-EVENTS-08).
            .reloadOnReconnect(if: viewModel.events.isEmpty || viewModel.servedFromStaleCache) {
                async let eventsRefresh: () = viewModel.refresh()
                async let restaurantsRefresh: Bool = restaurantsVM.refresh()
                async let attractionsRefresh: () = attractionsVM.refresh()
                async let weekendRefresh: () = weekendVM.refresh()
                async let tonightRefresh: () = tonightVM.refresh()
                _ = await (eventsRefresh, restaurantsRefresh, attractionsRefresh, weekendRefresh, tonightRefresh)
            }
            .navigationTitle("Des Moines Insider")
            .navigationBarTitleDisplayMode(.large)
            .searchable(
                text: $viewModel.searchText,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: "Search events"
            )
            .toolbar {
                // The filter glyph that sat here cleared every filter while its
                // label promised a filter screen; the sticky bar's "Clear all"
                // does that honestly (IOS-DD-EVENTS-11).
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
                railOrder = HomeRailOrdering.current()
                // The rail VMs start on their own windows (init), so they load
                // alongside the feed instead of after it.
                async let eventsLoad: () = viewModel.loadInitialData()
                async let restaurantsLoad: () = restaurantsVM.loadInitialData()
                async let attractionsLoad: () = attractionsVM.loadInitialData()
                async let weekendLoad: () = weekendVM.loadInitialData()
                async let tonightLoad: () = tonightVM.loadInitialData()
                _ = await (eventsLoad, restaurantsLoad, attractionsLoad, weekendLoad, tonightLoad)
                // IOS-PARITY-005 — warm the Best-Of winners cache so award
                // badges surface on cards across the app (fail-soft).
                await BestOfViewModel.refreshWinners()
            }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { railOrder = HomeRailOrdering.current() }
            }
            .toastOverlay(message: $toast)
        }
    }

    /// A search is typed. Home collapses to results (IOS-DD-EVENTS-11).
    private var isSearching: Bool { !viewModel.searchText.isEmpty }

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
        case .popularRestaurants:
            // Restaurants live on the Dining tab; this pushed the attractions
            // list (IOS-DD-EVENTS-11).
            DeepLinkHandler.shared.open(.tab(.restaurants))
        case .trendingAttractions:
            navigationPath.append(HomeDestination.attractions)
        case .tonight:
            viewModel.applyPreset(.tonight)
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
                    // The server's total, not the rows loaded so far; and
                    // "Updating..." while a refilter is in flight
                    // (IOS-DD-EVENTS-09).
                    if viewModel.isRefiltering {
                        ProgressView().controlSize(.small)
                    }
                    Text(resultCountText)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)

                    if isSearching {
                        FilterChipView(text: "\"\(viewModel.searchText)\"", icon: "magnifyingglass") {
                            viewModel.searchText = ""
                        }
                    }

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

    private var resultCountText: String {
        if viewModel.isRefiltering { return "Updating..." }
        return viewModel.totalCount == 1 ? "1 result" : "\(viewModel.totalCount) results"
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
                    title: isSearching ? "No matches for \"\(viewModel.searchText)\"" : "No Events Found",
                    message: isSearching
                        ? "Try a shorter word, or clear the search to browse everything."
                        : "Try adjusting your filters or check back later.",
                    actionTitle: viewModel.activeFilterCount > 0 ? "Clear Filters" : nil,
                    action: { viewModel.clearFilters() }
                )
                .padding(.top, 40)
            } else {
                LazyVStack(spacing: 12) {
                    // Nothing matched exactly; these are the fuzzy matches
                    // (IOS-DD-EVENTS-19).
                    if viewModel.isFuzzyFallback {
                        Text("No exact matches. Did you mean...")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    ForEach(Array(viewModel.arrangedEvents.enumerated()), id: \.element.id) { index, event in
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
                            // The VM owns the load-more task so a filter change
                            // can cancel it (IOS-DD-EVENTS-03).
                            viewModel.loadMoreIfNeeded(currentItem: event)
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
                // Old rows dim while a filter change loads, so they are not
                // read as the answer to the new chips (IOS-DD-EVENTS-09).
                .opacity(viewModel.isRefiltering ? 0.5 : 1)
                .animation(.easeInOut(duration: 0.2), value: viewModel.isRefiltering)
            }
        }
        .padding(.bottom, 20)
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
