import SwiftUI

/// Unified search across events, restaurants, and attractions.
struct SearchView: View {
    @State private var viewModel = SearchViewModel()
    @State private var dictation = SpeechDictationService.shared
    @State private var dispatcher = PulseIntentDispatcher.shared
    @State private var navigationPath = NavigationPath()
    @State private var showScrollToTop = false
    @State private var showDictationDeniedAlert = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

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
                } else if viewModel.isEmpty && !NetworkMonitor.shared.isConnected {
                    EmptyStateView(
                        icon: "wifi.slash",
                        title: "You're Offline",
                        message: "Check your internet connection and try again.",
                        actionTitle: "Retry",
                        action: { viewModel.clearSearch() }
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
            .refreshable {
                guard NetworkMonitor.shared.isConnected else {
                    UINotificationFeedbackGenerator().notificationOccurred(.error)
                    return
                }
                await viewModel.refresh()
                if viewModel.isEmpty {
                    UINotificationFeedbackGenerator().notificationOccurred(.error)
                } else {
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                }
            }
            .searchable(
                text: $viewModel.searchText,
                prompt: NetworkMonitor.shared.isConnected
                    ? "Search events, restaurants, attractions..."
                    : "Search unavailable offline"
            )
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    micButton
                }
                // IOS-PARITY-008 — save the current search (gated to Insider+).
                if viewModel.hasSearched && !viewModel.searchText.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        SaveSearchButton(query: viewModel.searchText, tab: viewModel.selectedTab.rawValue)
                    }
                }
            }
            // Don't freeze the whole screen offline — the searchable prompt and
            // the "You're Offline" empty state already communicate the state, and
            // typing / tapping suggestions / recents are local-only actions
            // (IOS-AUDIT-UX-026).
            .navigationTitle("Search")
            .onChange(of: dictation.transcript) { _, newValue in
                // Live-update the search field as the user dictates
                if !newValue.isEmpty { viewModel.searchText = newValue }
            }
            .onChange(of: dispatcher.pending) { _, pending in
                applyIntent(pending)
            }
            .task {
                applyIntent(dispatcher.pending)
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

    // MARK: - Voice Dictation (IOS-DISCOVER-2026-007)

    /// In-toolbar microphone button. Tapping toggles SFSpeechRecognizer
    /// dictation directly into the search field. When permission is denied,
    /// surfaces a one-tap settings deep-link instead of silently failing.
    private var micButton: some View {
        Button {
            Task {
                switch dictation.status {
                case .denied:
                    showDictationDeniedAlert = true
                default:
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    await dictation.toggle()
                }
            }
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

    /// Apply a Siri / Shortcut intent payload to the search experience.
    /// Composes a search string from the structured fields so the existing
    /// SearchViewModel handles the navigation.
    private func applyIntent(_ pending: PulseIntentDispatcher.Pending?) {
        guard let pending else { return }
        switch pending {
        case .findRestaurants(let cuisine, let area, let openNow):
            var parts: [String] = []
            if let cuisine, !cuisine.isEmpty { parts.append(cuisine) }
            parts.append("restaurants")
            if let area, !area.isEmpty { parts.append("in \(area)") }
            if openNow { parts.append("open now") }
            viewModel.searchText = parts.joined(separator: " ")
        case .findEvents(let category, let datePreset):
            var parts: [String] = []
            if let category, !category.isEmpty { parts.append(category) }
            parts.append("events")
            if let datePreset, !datePreset.isEmpty { parts.append(datePreset) }
            viewModel.searchText = parts.joined(separator: " ")
        case .askPulse:
            // Ask Pulse opens the AI chat surface, presented by MainTabView —
            // not a keyword search (IOS-AUDIT-FEAT-028). Leave the payload for
            // MainTabView to consume; don't handle it here.
            return
        }
        // Clear the pending payload — handled.
        _ = dispatcher.consume()
    }

    // MARK: - Tab Picker

    private var tabPicker: some View {
        HStack(spacing: 0) {
            ForEach(SearchViewModel.SearchTab.allCases) { tab in
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    withAnimation(reduceMotion ? nil : .snappy) { viewModel.selectedTab = tab }
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
                .accessibilityAddTraits(viewModel.selectedTab == tab ? .isSelected : [])
            }
        }
        .padding(6)
        .glassChip(cornerRadius: PremiumTokens.cornerLg, material: .thinMaterial)
        .padding(.horizontal)
        .padding(.top, 8)
    }

    // MARK: - Search Suggestions

    private var searchSuggestions: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Recent searches
                recentSearchesSection

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
        ScrollViewReader { proxy in
        ScrollView {
            LazyVStack(spacing: 12) {
                Color.clear.frame(height: 0).id("top")

                // IOS-AUDIT-UX-051 AC2. The whole-search empty state above fires
                // only when EVERY tab is empty, so a search matching 6 events and
                // 0 restaurants rendered the Restaurants tab as a blank scroll
                // view - indistinguishable from a tab that had not finished
                // loading. The tab bar already shows a per-tab count; this says
                // the same thing where the user is actually looking.
                if countFor(viewModel.selectedTab) == 0 {
                    emptyTabState
                }

                switch viewModel.selectedTab {
                case .events:
                    ForEach(Array(viewModel.eventResults.enumerated()), id: \.element.id) { index, event in
                        Button {
                            navigationPath.append(event)
                        } label: {
                            EventCardView(event: event)
                        }
                        .buttonStyle(.pressableCard)
                        .entranceAnimation(index: index)
                    }

                case .restaurants:
                    ForEach(Array(viewModel.restaurantResults.enumerated()), id: \.element.id) { index, restaurant in
                        Button {
                            navigationPath.append(restaurant)
                        } label: {
                            RestaurantCardView(restaurant: restaurant)
                        }
                        .buttonStyle(.pressableCard)
                        .entranceAnimation(index: index)
                    }

                case .attractions:
                    ForEach(Array(viewModel.attractionResults.enumerated()), id: \.element.id) { index, attraction in
                        Button {
                            navigationPath.append(attraction)
                        } label: {
                            AttractionCardView(attraction: attraction)
                        }
                        .buttonStyle(.pressableCard)
                        .entranceAnimation(index: index)
                    }
                }
            }
            .padding()
            .trackScrollOffset(showScrollToTop: $showScrollToTop)
        }
        .scrollOffsetCoordinateSpace()
        .overlay(alignment: .bottomTrailing) {
            ScrollToTopButton(isVisible: showScrollToTop) {
                withAnimation { proxy.scrollTo("top") }
            }
        }
        } // ScrollViewReader
    }

    // MARK: - Recent Searches

    @ViewBuilder
    private var recentSearchesSection: some View {
        let history = SearchHistoryService.shared
        if !history.recentSearches.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("Recent Searches")
                        .font(.headline)
                    Spacer()
                    Button("Clear") {
                        withAnimation { history.clearAll() }
                    }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.accentColor)
                }
                .padding(.horizontal)

                ForEach(history.recentSearches, id: \.self) { query in
                    HStack {
                        Button {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            viewModel.searchText = query
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
                            withAnimation { history.remove(query) }
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

    /// Shown when the SELECTED tab has no matches but the search itself did.
    ///
    /// Names the other tabs that do have results, so the user can act on it
    /// rather than concluding the search failed.
    private var emptyTabState: some View {
        let others = SearchViewModel.SearchTab.allCases
            .filter { $0 != viewModel.selectedTab && countFor($0) > 0 }

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

    private func countFor(_ tab: SearchViewModel.SearchTab) -> Int {
        switch tab {
        case .events: return viewModel.eventResults.count
        case .restaurants: return viewModel.restaurantResults.count
        case .attractions: return viewModel.attractionResults.count
        }
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
