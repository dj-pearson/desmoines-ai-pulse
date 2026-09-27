import SwiftUI

/// Unified search across events, restaurants, and attractions.
///
/// The body is split into small computed views and extensions (IOS-DD-SEARCH-03):
/// one expression holding the content switch plus every modifier is the shape
/// that stopped FavoritesView.body type-checking on Xcode 26.
struct SearchView: View {
    @State private var viewModel = SearchViewModel()
    @State private var dictation = SpeechDictationService.shared
    @State private var dispatcher = PulseIntentDispatcher.shared
    @State private var savedSearches = SavedSearchesViewModel.shared
    @State private var navigationPath = NavigationPath()
    @State private var showScrollToTop = false
    @State private var showDictationDeniedAlert = false
    @State private var confirmClearHistory = false
    @State private var toast: ToastMessage?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack(path: $navigationPath) {
            screen
                .navigationDestination(for: Event.self) { event in
                    EventDetailView(event: event)
                }
                .navigationDestination(for: Restaurant.self) { restaurant in
                    RestaurantDetailView(restaurant: restaurant)
                }
                .navigationDestination(for: Attraction.self) { attraction in
                    AttractionDetailView(attraction: attraction)
                }
                .navigationDestination(for: SavedSearch.self) { search in
                    SavedSearchResultsView(savedSearch: search)
                }
        }
    }

    /// Lifecycle and observers.
    private var screen: some View {
        searchScreen
            .onChange(of: dictation.transcript) { _, newValue in
                // Live-update the search field as the user dictates
                if !newValue.isEmpty { viewModel.searchText = newValue }
            }
            .onChange(of: dictation.lastFinalTranscript) { _, finished in
                // A finished dictation is a committed query (IOS-DD-SEARCH-04).
                guard finished != nil else { return }
                Task {
                    await viewModel.performSearchNow()
                    viewModel.commitToHistory()
                }
            }
            .onChange(of: dispatcher.pending) { _, pending in
                applyIntent(pending)
            }
            .onChange(of: scenePhase) { _, phase in
                // Back from Settings with the mic allowed (IOS-DD-SEARCH-13).
                if phase == .active { dictation.refreshPermissionStatus() }
            }
            .onChange(of: NetworkMonitor.shared.isConnected) { _, connected in
                if connected && viewModel.hasSearched {
                    Task { await viewModel.performSearchNow() }
                }
            }
            .task {
                applyIntent(dispatcher.pending)
                await savedSearches.load()
            }
            .onDisappear {
                // Navigating away mid-dictation left the recogniser running and
                // the audio session active - the mic indicator stayed on and other
                // apps stayed ducked until the app was killed (IOS-AUDIT-PERF-016
                // AC3, 'and on view dismissal'). stop() is idempotent.
                dictation.stop()
            }
            .alert("Microphone access needed", isPresented: $showDictationDeniedAlert) {
                Button("Open Settings") { SpeechDictationService.openSettings() }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Enable microphone and speech recognition in Settings to dictate search terms.")
            }
    }

    /// The column, the search field and the toolbar.
    private var searchScreen: some View {
        mainColumn
            .refreshable { await pullToRefresh() }
            .searchable(
                text: $viewModel.searchText,
                prompt: NetworkMonitor.shared.isConnected
                    ? "Search events, restaurants, attractions..."
                    : "Search unavailable offline"
            )
            // Return on the keyboard is the clearest "this is my search". It
            // skips the debounce, and records only once this query's results
            // are in, not the previous keystroke's.
            .onSubmit(of: .search) {
                Task {
                    await viewModel.performSearchNow()
                    viewModel.commitToHistory()
                }
            }
            .toolbar { toolbarContent }
            // Don't freeze the whole screen offline — the searchable prompt and
            // the "You're Offline" empty state already communicate the state, and
            // typing / tapping suggestions / recents are local-only actions
            // (IOS-AUDIT-UX-026).
            .navigationTitle("Search")
            // Owned here rather than by the toolbar button, which cannot
            // reliably host an overlay (IOS-DD-SEARCH-11).
            .toastOverlay(message: $toast)
            .confirmationDialog("Clear recent searches?", isPresented: $confirmClearHistory, titleVisibility: .visible) {
                Button("Clear", role: .destructive) {
                    withAnimation { SearchHistoryService.shared.clearAll() }
                }
                Button("Cancel", role: .cancel) {}
            }
    }

    private var mainColumn: some View {
        VStack(spacing: 0) {
            if viewModel.hasSearched {
                tabPicker
                filterChipsRow
            }
            content
        }
    }

    /// Which state the screen is in. Results already on screen stay there
    /// while a new search runs; the spinner is only for a screen with nothing
    /// to show (IOS-DD-SEARCH-03).
    @ViewBuilder
    private var content: some View {
        if !viewModel.hasSearched && !viewModel.isSearching {
            searchSuggestions
        } else if viewModel.isSearching && viewModel.totalResults == 0 {
            loadingView
        } else if !NetworkMonitor.shared.isConnected && viewModel.totalResults == 0 {
            EmptyStateView(
                icon: "wifi.slash",
                title: "You're Offline",
                message: "Check your internet connection and try again.",
                actionTitle: "Retry",
                action: { Task { await viewModel.performSearchNow() } }
            )
        } else if viewModel.allFailed && viewModel.totalResults == 0 {
            EmptyStateView(
                icon: "exclamationmark.triangle",
                title: "Search isn't responding",
                message: "We couldn't reach Des Moines Insider. Your search is still here.",
                actionTitle: "Try again",
                action: { Task { await viewModel.performSearchNow() } }
            )
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

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            micButton
        }
        // IOS-PARITY-008 — save the current search (gated to Insider+).
        if viewModel.hasSearched && !viewModel.normalizedQuery.isEmpty {
            ToolbarItem(placement: .topBarTrailing) {
                SaveSearchButton(
                    query: viewModel.normalizedQuery,
                    tab: viewModel.selectedTab.rawValue,
                    parsed: viewModel.parsed,
                    hadEventResults: !viewModel.eventResults.isEmpty,
                    toast: $toast
                )
            }
        }
    }

    private func pullToRefresh() async {
        guard NetworkMonitor.shared.isConnected else {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            return
        }
        await viewModel.refresh()
        let failed = viewModel.allFailed || viewModel.isEmpty
        UINotificationFeedbackGenerator().notificationOccurred(failed ? .error : .success)
    }

    // MARK: - Siri / Shortcuts (IOS-DD-SEARCH-06)

    /// Apply a Find Restaurants / Find Events payload as structured filters,
    /// on the tab it asked for, at the root of the stack. It used to join the
    /// fields into one sentence, search it on the Events tab, and load the
    /// results under whatever detail screen was open.
    private func applyIntent(_ pending: PulseIntentDispatcher.Pending?) {
        // Ask Pulse has no search route: MainTabView presents the chat and
        // consumes it (IOS-AUDIT-FEAT-028).
        guard let pending, let route = pending.searchRoute else { return }
        navigationPath = NavigationPath()
        viewModel.filters = route.filters
        viewModel.selectedTab = route.tab
        viewModel.searchText = route.text
        // Clear the pending payload — handled.
        _ = dispatcher.consume()
    }
}

// MARK: - Voice Dictation (IOS-DISCOVER-2026-007)

extension SearchView {
    /// In-toolbar microphone button. Tapping toggles SFSpeechRecognizer
    /// dictation directly into the search field. When permission is denied,
    /// surfaces a one-tap settings deep-link instead of silently failing.
    private var micButton: some View {
        Button {
            Task { await micTapped() }
        } label: {
            Image(systemName: micIconName)
                .foregroundStyle(dictation.statusIsListening ? .red : .primary)
                .symbolEffect(.pulse, isActive: dictation.statusIsListening)
        }
        .accessibilityLabel(dictation.statusIsListening ? "Stop dictation" : "Start voice search")
    }

    private var micIconName: String {
        if case .listening = dictation.status { return "mic.fill" }
        if case .denied = dictation.status { return "mic.slash" }
        return "mic"
    }

    /// A denied state is re-checked before showing the Settings alert, since
    /// the user may have allowed access there since (IOS-DD-SEARCH-13).
    private func micTapped() async {
        if case .denied = dictation.status {
            guard SpeechDictationService.permissionsGranted() else {
                showDictationDeniedAlert = true
                return
            }
            dictation.refreshPermissionStatus()
        }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        await dictation.toggle()
        switch dictation.status {
        case .unavailable, .error:
            toast = .info("Voice search isn't available right now", icon: "mic.slash")
        case .denied:
            showDictationDeniedAlert = true
        case .idle, .listening:
            break
        }
    }
}

// MARK: - Tab Picker (IOS-DD-SEARCH-07, -16)

extension SearchView {
    private var tabPicker: some View {
        tabPickerRow
            .padding(6)
            .glassChip(cornerRadius: PremiumTokens.cornerLg, material: .thinMaterial)
            .padding(.horizontal)
            .padding(.top, 8)
    }

    /// Three equal columns normally. At accessibility sizes they cannot fit,
    /// so the row scrolls and each tab keeps its natural width.
    @ViewBuilder
    private var tabPickerRow: some View {
        if dynamicTypeSize.isAccessibilitySize {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(SearchViewModel.SearchTab.allCases) { tab in
                        tabButton(tab, fill: false)
                    }
                    searchingIndicator
                }
            }
        } else {
            HStack(spacing: 0) {
                ForEach(SearchViewModel.SearchTab.allCases) { tab in
                    tabButton(tab, fill: true)
                }
                searchingIndicator
            }
        }
    }

    /// Results stay on screen while a new search runs; this says one is.
    @ViewBuilder
    private var searchingIndicator: some View {
        if viewModel.isSearching {
            ProgressView()
                .controlSize(.small)
                .padding(.horizontal, 6)
                .accessibilityLabel("Searching")
        }
    }

    private func tabButton(_ tab: SearchViewModel.SearchTab, fill: Bool) -> some View {
        let selected = viewModel.selectedTab == tab
        return Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            withAnimation(reduceMotion ? nil : .snappy) { viewModel.selectTab(tab) }
        } label: {
            VStack(spacing: 6) {
                tabLabel(tab)
                Rectangle()
                    .fill(selected ? Color.accentColor : Color.clear)
                    .frame(height: 2)
            }
        }
        .foregroundStyle(selected ? .primary : .secondary)
        .frame(maxWidth: fill ? .infinity : nil)
        .accessibilityLabel(tabAccessibilityLabel(tab))
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    /// Icon, name and count; then name and count; then icon and count.
    private func tabLabel(_ tab: SearchViewModel.SearchTab) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 4) {
                Image(systemName: tab.icon).font(.caption2)
                tabTitle(tab)
                tabBadge(tab)
            }
            HStack(spacing: 4) {
                tabTitle(tab)
                tabBadge(tab)
            }
            HStack(spacing: 4) {
                Image(systemName: tab.icon).font(.caption2)
                tabBadge(tab)
            }
        }
    }

    private func tabTitle(_ tab: SearchViewModel.SearchTab) -> some View {
        Text(tab.rawValue)
            .font(.subheadline.weight(.medium))
            .lineLimit(1)
            .minimumScaleFactor(0.8)
    }

    @ViewBuilder
    private func tabBadge(_ tab: SearchViewModel.SearchTab) -> some View {
        let count = viewModel.count(for: tab)
        if count > 0 {
            let selected = viewModel.selectedTab == tab
            Text(viewModel.hasMore[tab] == true ? "\(count)+" : "\(count)")
                .font(.caption2.weight(.bold))
                .lineLimit(1)
                .padding(.horizontal, 5)
                .padding(.vertical, 1)
                .background(selected ? Color.accentColor : Color(.systemGray5), in: Capsule())
                .foregroundStyle(selected ? .white : .secondary)
        }
    }

    private func tabAccessibilityLabel(_ tab: SearchViewModel.SearchTab) -> String {
        let count = viewModel.count(for: tab)
        if viewModel.failedTabs.contains(tab) { return "\(tab.rawValue), couldn't load" }
        if viewModel.hasMore[tab] == true { return "\(tab.rawValue), more than \(count) results" }
        return "\(tab.rawValue), \(count) results"
    }
}

// MARK: - Filter chips (IOS-DD-SEARCH-05)

extension SearchView {
    /// One removable chip per filter in effect, whether it came from words in
    /// the field ("tonight") or from a chip, tile or Siri.
    @ViewBuilder
    private var filterChipsRow: some View {
        let chips = viewModel.parsed.filters.chips
        if !chips.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(chips) { chip in
                        filterChip(chip)
                    }
                }
                .padding(.horizontal)
            }
            .padding(.top, 6)
        }
    }

    private func filterChip(_ chip: SearchFilterChip) -> some View {
        Button {
            HapticFeedback.shared.selection()
            removeFilter(chip)
        } label: {
            HStack(spacing: 4) {
                Text(chip.label)
                Image(systemName: "xmark")
                    .font(.caption2.weight(.bold))
                    .accessibilityHidden(true)
            }
            .font(.footnote.weight(.medium))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color.accentColor.opacity(0.14), in: Capsule())
        }
        .buttonStyle(.plain)
        .minHitTarget()
        .accessibilityLabel("Remove \(chip.label) filter")
    }

    /// An explicit filter is cleared; one that came from the text has its
    /// words taken out of the field.
    private func removeFilter(_ chip: SearchFilterChip) {
        if viewModel.filters.contains(chip) {
            viewModel.filters = viewModel.filters.removing(chip)
        }
        if SearchQueryParser.parse(viewModel.normalizedQuery).filters.contains(chip) {
            viewModel.searchText = SearchQueryParser.removing(chip, from: viewModel.searchText)
        }
    }
}

// MARK: - Search Suggestions (IOS-DD-SEARCH-08)

extension SearchView {
    private var searchSuggestions: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                quickFilters
                savedSearchesRow
                recentSearchesSection
                categoryTiles
                trySearching
            }
            .padding(.top, 20)
        }
    }

    /// Time-aware one-tap filters. Each runs a search with no words.
    private var quickFilters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                SuggestionChip(text: "Tonight") {
                    applyQuickFilter(SearchFilters(datePreset: .tonight, tabHint: .events))
                }
                SuggestionChip(text: "This weekend") {
                    applyQuickFilter(SearchFilters(datePreset: .thisWeekend, tabHint: .events))
                }
                SuggestionChip(text: "Free") {
                    applyQuickFilter(SearchFilters(freeOnly: true, tabHint: .events))
                }
                SuggestionChip(text: "Open now") {
                    applyQuickFilter(SearchFilters(openNow: true, tabHint: .restaurants))
                }
            }
            .padding(.horizontal)
        }
    }

    private func applyQuickFilter(_ filters: SearchFilters) {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        viewModel.filters = filters
        if let tab = filters.tabHint { viewModel.selectedTab = tab }
    }

    /// Saved searches used to be reachable only from the Dashboard.
    @ViewBuilder
    private var savedSearchesRow: some View {
        if savedSearches.isAuthenticated && !savedSearches.savedSearches.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("Your saved searches")
                    .font(.headline)
                    .padding(.horizontal)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(savedSearches.savedSearches.prefix(6)) { search in
                            SuggestionChip(text: search.name) {
                                navigationPath.append(search)
                            }
                        }
                    }
                    .padding(.horizontal)
                }
            }
        }
    }

    /// Category tiles are filters now. They used to type the display name
    /// ("Arts & Culture") into the field, which full-text search ANDs and the
    /// attractions match could never find.
    private var categoryTiles: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Popular Categories")
                .font(.headline)
                .padding(.horizontal)

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 10)], spacing: 10) {
                ForEach(EventCategory.allCases.prefix(8)) { category in
                    categoryTile(category)
                }
            }
            .padding(.horizontal)
        }
    }

    private func categoryTile(_ category: EventCategory) -> some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            viewModel.filters = SearchFilters(category: category, tabHint: .events)
            viewModel.selectedTab = .events
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
        .accessibilityLabel("Show \(category.displayName) events")
    }

    private static let suggestions = [
        "Live music tonight", "Free this weekend", "Downtown restaurants open now",
        "Family friendly", "Comedy tonight",
    ]

    private var trySearching: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Try Searching")
                .font(.headline)
                .padding(.horizontal)

            ForEach(Self.suggestions, id: \.self) { suggestion in
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    runCommitted(suggestion)
                } label: {
                    suggestionRow(suggestion, icon: "magnifyingglass")
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func suggestionRow(_ text: String, icon: String) -> some View {
        HStack {
            Image(systemName: icon)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(text)
                .font(.subheadline)
            Spacer()
            Image(systemName: "arrow.up.left")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }

    /// A query the user picked rather than typed: search now, then record it.
    private func runCommitted(_ query: String) {
        viewModel.searchText = query
        Task {
            await viewModel.performSearchNow()
            viewModel.commitToHistory()
        }
    }

    // MARK: Recent Searches

    @ViewBuilder
    private var recentSearchesSection: some View {
        let history = SearchHistoryService.shared
        if !history.recentSearches.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("Recent Searches")
                        .font(.headline)
                    Spacer()
                    Button("Clear") { confirmClearHistory = true }
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.accentColor)
                        .minHitTarget()
                        .accessibilityHint("Clears your recent search history")
                }
                .padding(.horizontal)

                ForEach(history.recentSearches, id: \.self) { query in
                    recentRow(query)
                }
            }
        }
    }

    private func recentRow(_ query: String) -> some View {
        HStack {
            Button {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                runCommitted(query)
            } label: {
                HStack {
                    Image(systemName: "clock.arrow.counterclockwise")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(query)
                        .font(.subheadline)
                    Spacer()
                    Image(systemName: "arrow.up.left")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
            .buttonStyle(.plain)

            Button {
                withAnimation { SearchHistoryService.shared.remove(query) }
            } label: {
                Image(systemName: "xmark")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            .buttonStyle(.plain)
            // 44pt target so the glyph-sized delete isn't mis-tapped
            // next to the apply-search row (IOS-AUDIT-UX-043).
            .minHitTarget()
            .accessibilityLabel("Remove \(query) from recent searches")
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
    }
}

// MARK: - Results List

extension SearchView {
    private var resultsList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 12) {
                    Color.clear.frame(height: 0).id("top")
                    resultsHeader
                    resultRows
                }
                .padding()
                .opacity(viewModel.isSearching ? 0.6 : 1)
                .trackScrollOffset(showScrollToTop: $showScrollToTop)
            }
            .scrollOffsetCoordinateSpace()
            .overlay(alignment: .bottomTrailing) {
                ScrollToTopButton(isVisible: showScrollToTop) {
                    withAnimation { proxy.scrollTo("top") }
                }
            }
        }
    }

    /// What sits above the rows: a failed tab's retry, the empty-tab note, or
    /// the close-matches caption.
    @ViewBuilder
    private var resultsHeader: some View {
        let tab = viewModel.selectedTab
        if viewModel.failedTabs.contains(tab) {
            failedTabRow(tab)
        } else if viewModel.count(for: tab) == 0 {
            // IOS-AUDIT-UX-051 AC2. The whole-search empty state fires only
            // when EVERY tab is empty, so a search matching 6 events and 0
            // restaurants rendered the Restaurants tab as a blank scroll view.
            emptyTabState
        } else if viewModel.fuzzyTabs.contains(tab) {
            Text("Showing close matches for \"\(viewModel.resultKeywords)\"")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder
    private var resultRows: some View {
        switch viewModel.selectedTab {
        case .events:
            ForEach(Array(viewModel.eventResults.enumerated()), id: \.element.id) { index, event in
                Button {
                    open(event)
                } label: {
                    EventCardView(event: event)
                }
                .buttonStyle(.pressableCard)
                .entranceAnimation(index: index)
            }

        case .restaurants:
            ForEach(Array(viewModel.restaurantResults.enumerated()), id: \.element.id) { index, restaurant in
                Button {
                    open(restaurant)
                } label: {
                    RestaurantCardView(restaurant: restaurant)
                }
                .buttonStyle(.pressableCard)
                .entranceAnimation(index: index)
            }

        case .attractions:
            ForEach(Array(viewModel.attractionResults.enumerated()), id: \.element.id) { index, attraction in
                Button {
                    open(attraction)
                } label: {
                    AttractionCardView(attraction: attraction)
                }
                .buttonStyle(.pressableCard)
                .entranceAnimation(index: index)
            }
        }
    }

    /// Opening a result commits the query to Recent (IOS-DD-SEARCH-04).
    private func open<Value: Hashable>(_ value: Value) {
        viewModel.commitToHistory()
        navigationPath.append(value)
    }

    private func failedTabRow(_ tab: SearchViewModel.SearchTab) -> some View {
        Button {
            Task { await viewModel.performSearchNow() }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle")
                    .accessibilityHidden(true)
                Text("Couldn't load \(tab.rawValue.lowercased()) - Try again")
                    .font(.subheadline)
                Spacer()
            }
            .foregroundStyle(.secondary)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: Loading

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
            Text("Searching...")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// Shown when the SELECTED tab has no matches but the search itself did.
    ///
    /// Names the other tabs that do have results, so the user can act on it
    /// rather than concluding the search failed.
    private var emptyTabState: some View {
        let others = SearchViewModel.SearchTab.allCases
            .filter { $0 != viewModel.selectedTab && viewModel.count(for: $0) > 0 }

        return VStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.title)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text("No \(viewModel.selectedTab.rawValue.lowercased()) match this search.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            if !others.isEmpty {
                Text("Results in \(others.map(\.rawValue).joined(separator: " and ")).")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
    }
}

// MARK: - Attraction Card (used in search results)

/// IOS-IA-003: thin wrapper over the unified `ContentCard` (`.listRow`) so
/// search attraction results match the Attractions tab and Home rails.
struct AttractionCardView: View {
    let attraction: Attraction

    var body: some View {
        ContentCard(attraction.cardData, variant: .listRow)
    }
}

#Preview {
    SearchView()
}
