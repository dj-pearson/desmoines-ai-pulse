import Foundation

/// Unified search across events, restaurants, and attractions.
@MainActor
@Observable
final class SearchViewModel {
    // MARK: - State

    /// Equal assignments are ignored (IOS-DD-SEARCH-15): SavedSearchResultsView
    /// re-assigned the same query on every reappear, which re-searched, flashed
    /// the spinner and lost the scroll position on Back from a detail.
    /// `performSearchNow()` is the explicit re-run.
    var searchText = "" {
        didSet {
            guard searchText != oldValue else { return }
            performSearch()
        }
    }

    /// Filters set by a chip, a category tile, a Siri intent or a saved search
    /// (IOS-DD-SEARCH-05). They win over what the words in `searchText` parse
    /// to, field by field.
    var filters = SearchFilters() {
        didSet {
            guard filters != oldValue else { return }
            performSearch()
        }
    }

    /// False for a screen that re-runs a query the user did not type, so it is
    /// not written into Recent (IOS-DD-SEARCH-04).
    var recordsHistory = true

    private(set) var eventResults: [Event] = []
    private(set) var restaurantResults: [Restaurant] = []
    private(set) var attractionResults: [Attraction] = []
    private(set) var isSearching = false
    private(set) var hasSearched = false

    /// Tabs whose request failed on the last search (IOS-DD-SEARCH-03). Each
    /// leg used to `catch { return [] }`, so an outage read as "No Results".
    private(set) var failedTabs: Set<SearchTab> = []
    /// Tabs whose rows came from the fuzzy fallback, so the view can say they
    /// are close matches rather than hits (IOS-DD-SEARCH-07).
    private(set) var fuzzyTabs: Set<SearchTab> = []
    /// Whether the server has more rows than the 20 shown, per tab.
    private(set) var hasMore: [SearchTab: Bool] = [:]
    /// The keywords of the search whose results are on screen.
    private(set) var resultKeywords = ""

    var selectedTab: SearchTab = .events

    /// Set once the user taps a tab, so results arriving later do not move
    /// them. Reset when the query changes (IOS-DD-SEARCH-07).
    private var userPickedTab = false
    /// The last query started, to tell a new query from a re-run.
    private var lastQuery: ParsedSearch?

    enum SearchTab: String, CaseIterable, Identifiable {
        case events = "Events"
        case restaurants = "Restaurants"
        case attractions = "Attractions"

        var id: String { rawValue }

        var icon: String {
            switch self {
            case .events: return "calendar"
            case .restaurants: return "fork.knife"
            case .attractions: return "mappin.and.ellipse"
            }
        }
    }

    /// One leg's answer: its rows, whether they came from the fuzzy fallback,
    /// and whether the server has more.
    struct Leg<Row> {
        var rows: [Row]
        var fuzzy = false
        var hasMore = false
    }

    // MARK: - Dependencies

    private let events: EventSearchProviding
    private let restaurants: RestaurantSearchProviding
    private let attractions: AttractionSearchProviding

    /// Defaults to the shared services, so no call site changes. The
    /// parameters exist so a test can hold a search open and observe what is
    /// on screen while it runs - which is the only way IOS-AUDIT-UX-054's
    /// "results stay visible" can be asserted (IOS-AUDIT-TEST-006).
    init(
        events: EventSearchProviding = EventsService.shared,
        restaurants: RestaurantSearchProviding = RestaurantsService.shared,
        attractions: AttractionSearchProviding = AttractionsService.shared
    ) {
        self.events = events
        self.restaurants = restaurants
        self.attractions = attractions
    }

    // MARK: - Search

    private var searchTask: Task<Void, Never>?

    /// `searchText` trimmed. A query of spaces used to run three requests, and
    /// the attractions leg matched `% %` against nearly every row
    /// (IOS-DD-SEARCH-03).
    var normalizedQuery: String {
        searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// The query as it will run: the words parsed, then the explicit filters
    /// laid over what they parsed to.
    var parsed: ParsedSearch {
        var result = SearchQueryParser.parse(normalizedQuery)
        result.filters = result.filters.merged(with: filters)
        return result
    }

    /// Two characters of keywords, or any filter at all ("Free events",
    /// a Tonight chip, a Siri intent with no text).
    static func shouldSearch(_ query: ParsedSearch) -> Bool {
        query.keywords.count >= 2 || !query.filters.isEmpty
    }

    /// Debounced entry point. Runs on every keystroke via `searchText.didSet`.
    private func performSearch() {
        searchTask?.cancel()

        let query = parsed
        guard Self.shouldSearch(query) else {
            clearResults()
            return
        }
        noteQuery(query)

        // Enter the loading state immediately so the 300ms debounce window
        // shows a spinner instead of a blank screen (IOS-AUDIT-UX-020).
        isSearching = true

        // The query is captured once so every sub-search uses the SAME term -
        // searchText can change mid-flight.
        searchTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await self?.runSearch(query)
        }
    }

    /// A different query than the last one hands tab choice back to the
    /// results; a re-run of the same one keeps the user's tab.
    private func noteQuery(_ query: ParsedSearch) {
        if query != lastQuery { userPickedTab = false }
        lastQuery = query
    }

    /// The user tapped a tab. Later results will not move them off it.
    func selectTab(_ tab: SearchTab) {
        selectedTab = tab
        userPickedTab = true
    }

    /// Re-run the current query immediately: no debounce, and the results
    /// already on screen stay there until the new ones replace them
    /// (IOS-AUDIT-UX-054).
    ///
    /// The old `refresh()` did `clearResults()` and then reassigned searchText
    /// to itself to retrigger the didSet. That blanked the list, dropped
    /// `hasSearched`, and then waited out the 300ms debounce before the first
    /// request even left - so a pull-to-refresh flashed the empty state for a
    /// third of a second and then flashed the results back.
    ///
    /// It also returned before any of that finished, because it was `async`
    /// only to satisfy `.refreshable`. The pull-to-refresh spinner therefore
    /// ended immediately and the list changed under the user a moment later.
    /// This one awaits the work.
    func performSearchNow() async {
        // Cancelling first is what keeps AC3 true: a refresh landing while a
        // keystroke search is in flight replaces it rather than racing it.
        searchTask?.cancel()

        let query = parsed
        guard Self.shouldSearch(query) else { return }
        noteQuery(query)

        isSearching = true
        // Written out rather than as a one-liner: a single-expression closure
        // over `self?.runSearch(...)` infers Task<()?, Never>, which does not
        // match searchTask.
        let task = Task { [weak self] in
            guard let self else { return }
            await self.runSearch(query)
        }
        searchTask = task
        await task.value
    }

    /// The search itself, shared by the debounced and immediate paths so the
    /// two cannot drift.
    private func runSearch(_ query: ParsedSearch) async {
        hasSearched = true

        async let events = searchEvents(query)
        async let restaurants = searchRestaurants(query)
        async let attractions = searchAttractions(query)

        let (e, r, a) = await (events, restaurants, attractions)
        // Results are assigned in one go, only if this search is still the
        // current one. Nothing is cleared beforehand, so the previous results
        // remain visible for the whole request.
        guard !Task.isCancelled else { return }
        apply(events: e, restaurants: r, attractions: a, for: query)
        isSearching = false
    }

    private func apply(
        events e: Result<Leg<Event>, Error>,
        restaurants r: Result<Leg<Restaurant>, Error>,
        attractions a: Result<Leg<Attraction>, Error>,
        for query: ParsedSearch
    ) {
        let eventLeg = try? e.get()
        let restaurantLeg = try? r.get()
        let attractionLeg = try? a.get()

        var failed: Set<SearchTab> = []
        if eventLeg == nil { failed.insert(.events) }
        if restaurantLeg == nil { failed.insert(.restaurants) }
        if attractionLeg == nil { failed.insert(.attractions) }
        failedTabs = failed

        // Every leg failed: keep what is on screen and let the view say the
        // search is not responding (IOS-DD-SEARCH-03).
        guard failed.count < SearchTab.allCases.count else { return }

        eventResults = eventLeg?.rows ?? []
        restaurantResults = restaurantLeg?.rows ?? []
        attractionResults = attractionLeg?.rows ?? []

        var fuzzy: Set<SearchTab> = []
        if eventLeg?.fuzzy == true { fuzzy.insert(.events) }
        if restaurantLeg?.fuzzy == true { fuzzy.insert(.restaurants) }
        fuzzyTabs = fuzzy

        hasMore = [
            .events: eventLeg?.hasMore ?? false,
            .restaurants: restaurantLeg?.hasMore ?? false,
            .attractions: attractionLeg?.hasMore ?? false,
        ]
        resultKeywords = query.keywords

        guard !userPickedTab else { return }
        let counts = Dictionary(uniqueKeysWithValues: SearchTab.allCases.map { ($0, count(for: $0)) })
        if let tab = Self.preferredTab(
            current: selectedTab,
            hint: query.filters.tabHint,
            counts: counts,
            exactMatch: exactMatchTab(keywords: query.keywords)
        ) {
            selectedTab = tab
        }
    }

    /// Which tab to show once results arrive, or nil to stay put
    /// (IOS-DD-SEARCH-07). The hinted tab when it has rows; otherwise, only if
    /// the current tab is empty, the tab whose first row is exactly what was
    /// typed, else the first tab with anything. "ramen" used to land on
    /// "No events match".
    static func preferredTab(
        current: SearchTab,
        hint: SearchTab?,
        counts: [SearchTab: Int],
        exactMatch: SearchTab?
    ) -> SearchTab? {
        if let hint, (counts[hint] ?? 0) > 0 { return hint }
        guard (counts[current] ?? 0) == 0 else { return nil }
        if let exactMatch, (counts[exactMatch] ?? 0) > 0 { return exactMatch }
        return SearchTab.allCases.first { (counts[$0] ?? 0) > 0 }
    }

    private func exactMatchTab(keywords: String) -> SearchTab? {
        guard !keywords.isEmpty else { return nil }
        func same(_ s: String?) -> Bool {
            s?.caseInsensitiveCompare(keywords) == .orderedSame
        }
        if same(eventResults.first?.title) { return .events }
        if same(restaurantResults.first?.name) { return .restaurants }
        if same(attractionResults.first?.name) { return .attractions }
        return nil
    }

    func count(for tab: SearchTab) -> Int {
        switch tab {
        case .events: return eventResults.count
        case .restaurants: return restaurantResults.count
        case .attractions: return attractionResults.count
        }
    }

    /// A cancelled request is not a failure: a newer search replaced it and
    /// its rows are discarded by runSearch's cancellation check anyway.
    private func failure<Row>(_ error: Error) -> Result<Leg<Row>, Error> {
        FavoritesService.isCancellation(error) ? .success(Leg(rows: [])) : .failure(error)
    }

    private func searchEvents(_ query: ParsedSearch) async -> Result<Leg<Event>, Error> {
        let f = query.filters
        let keywords = query.keywords
        let window = f.datePreset?.range(now: Date())
        do {
            let response = try await events.fetchEvents(query: .init(
                searchText: keywords.isEmpty ? nil : keywords,
                category: f.category?.rawValue,
                cities: f.areas.isEmpty ? nil : f.areas.map(\.rawValue),
                freeOnly: f.freeOnly,
                dateStart: window?.start,
                dateEnd: window?.end,
                limit: 20
            ))
            // The fuzzy fallback knows nothing of dates, areas or price, so it
            // runs only for a bare keyword search.
            if response.events.isEmpty, !keywords.isEmpty, f.isEmpty {
                let fuzzy = try await events.fuzzySearchEvents(query: keywords)
                return .success(Leg(rows: fuzzy, fuzzy: !fuzzy.isEmpty))
            }
            return .success(Leg(rows: response.events, hasMore: response.hasMore))
        } catch {
            return failure(error)
        }
    }

    /// Restaurants have no dates or price-free rule, so a query that is only
    /// "tonight" or "free" does not search them; a query with no words runs
    /// only for an area or Open Now.
    static func searchesRestaurants(_ query: ParsedSearch) -> Bool {
        let f = query.filters
        guard query.keywords.isEmpty else { return true }
        if f.datePreset != nil || f.freeOnly || f.category != nil { return false }
        return !f.areas.isEmpty || f.openNow
    }

    private func searchRestaurants(_ query: ParsedSearch) async -> Result<Leg<Restaurant>, Error> {
        guard Self.searchesRestaurants(query) else { return .success(Leg(rows: [])) }
        let f = query.filters
        let keywords = query.keywords
        do {
            let response = try await restaurants.fetchRestaurants(query: .init(
                searchText: keywords.isEmpty ? nil : keywords,
                locations: f.areas.isEmpty ? nil : f.areas.map(\.rawValue),
                // Open Now filters on the device, so ask for more to filter.
                limit: f.openNow ? 40 : 20
            ))
            var rows = response.restaurants
            if f.openNow { rows = rows.filter { $0.isOpenNow() == true } }
            if response.restaurants.isEmpty, !keywords.isEmpty, f.isEmpty {
                let fuzzy = try await restaurants.fuzzySearchRestaurants(query: keywords)
                return .success(Leg(rows: fuzzy, fuzzy: !fuzzy.isEmpty))
            }
            return .success(Leg(rows: rows, hasMore: response.hasMore))
        } catch {
            return failure(error)
        }
    }

    private func searchAttractions(_ query: ParsedSearch) async -> Result<Leg<Attraction>, Error> {
        // Attractions have no dates, price or hours to filter on; only words.
        guard !query.keywords.isEmpty else { return .success(Leg(rows: [])) }
        do {
            let response = try await attractions.fetchAttractions(
                query: .init(searchText: query.keywords, limit: 20)
            )
            return .success(Leg(rows: response.attractions, hasMore: response.hasMore))
        } catch {
            return failure(error)
        }
    }

    // MARK: - History

    /// Writes the query into Recent. Called when the user commits to it
    /// (submit, a result tap, a suggestion, finished dictation), not on every
    /// debounced result: restaurants prefix-match, so "piz" used to be stored,
    /// and so was every dictation partial and every saved search re-run
    /// (IOS-DD-SEARCH-04).
    func commitToHistory() {
        guard recordsHistory, normalizedQuery.count >= 2, totalResults > 0 else { return }
        SearchHistoryService.shared.record(normalizedQuery)
    }

    // MARK: - Results

    var totalResults: Int {
        eventResults.count + restaurantResults.count + attractionResults.count
    }

    var isEmpty: Bool {
        hasSearched && totalResults == 0 && !isSearching && failedTabs.isEmpty
    }

    /// Every leg failed on the last search.
    var allFailed: Bool {
        failedTabs.count == SearchTab.allCases.count
    }

    func clearResults() {
        eventResults = []
        restaurantResults = []
        attractionResults = []
        failedTabs = []
        fuzzyTabs = []
        hasMore = [:]
        resultKeywords = ""
        hasSearched = false
        userPickedTab = false
        lastQuery = nil
        // Clearing the query cancels any in-flight search, so leave the loading
        // state too (IOS-AUDIT-UX-020).
        isSearching = false
    }

    func clearSearch() {
        filters = SearchFilters()
        searchText = ""
        searchTask?.cancel()
        clearResults()
    }

    /// Pull-to-refresh. Kept as the name the views already call.
    func refresh() async {
        await performSearchNow()
    }
}
