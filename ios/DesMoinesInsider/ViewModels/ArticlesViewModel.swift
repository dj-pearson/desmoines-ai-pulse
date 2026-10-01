import Foundation

/// ViewModel for the Articles/Guides hub (IOS-PARITY-002). Mirrors
/// AttractionsViewModel: search, a single category filter, paginated loading,
/// and pull-to-refresh against the published `articles` table.
@MainActor
@Observable
final class ArticlesViewModel {
    // MARK: - Public State

    private(set) var articles: [Article] = []
    private(set) var categories: [String] = []
    private(set) var isLoading = false
    private(set) var isLoadingMore = false
    private(set) var errorMessage: String?
    private(set) var hasMore = false
    /// A refresh failed and the rows on screen are from the same query's last
    /// good load (IOS-DD-GUIDES-15).
    private(set) var showingStaleResults = false

    var searchText: String = "" {
        didSet {
            guard searchText != oldValue else { return }
            resetAndFetch()
        }
    }

    /// `nil` = "All".
    var selectedCategory: String? {
        didSet {
            guard selectedCategory != oldValue else { return }
            resetAndFetch()
        }
    }

    var activeFilterCount: Int {
        (selectedCategory != nil ? 1 : 0) +
        (searchText.trimmingCharacters(in: .whitespaces).isEmpty ? 0 : 1)
    }

    // MARK: - Dependencies

    private let service = ArticlesService.shared
    private let cache = QueryCache.shared
    private let pageSize = Config.defaultPageSize
    private var offset = 0
    /// Single debounced, cancellable fetch for search + the category filter so a
    /// stale response can't win the last-writer race (IOS-AUDIT-PERF-004).
    private var fetchTask: Task<Void, Never>?
    /// Bumped per reset; a concurrent `loadMoreIfNeeded` discards its page if a
    /// reset ran while it was in flight.
    private var loadGeneration = 0
    /// The query the rows in `articles` belong to. A failed fetch for a
    /// different query must not leave the old rows under the new chip
    /// (IOS-DD-GUIDES-15).
    private var loadedQueryKey: String?

    /// Cache key for the unfiltered first page (offline cold-start, IOS-COMPLY-004).
    private static let homeCacheKey = "articles-home"

    /// Whether the current view is the default, unfiltered list (the only state
    /// we cache for offline use).
    private var isDefaultView: Bool {
        selectedCategory == nil && searchText.trimmingCharacters(in: .whitespaces).isEmpty
    }

    // MARK: - Load

    func loadInitialData() async {
        guard articles.isEmpty else { return }
        async let categoriesLoad: Void = loadCategories()
        async let refreshLoad: Bool = refresh()
        _ = await (categoriesLoad, refreshLoad)
    }

    private func loadCategories() async {
        categories = await service.fetchCategories()
    }

    /// Identifies what `articles` holds: category plus trimmed search.
    nonisolated static func queryKey(category: String?, search: String) -> String {
        "\(category ?? "")|\(search.trimmingCharacters(in: .whitespaces))"
    }

    private var currentQueryKey: String {
        Self.queryKey(category: selectedCategory, search: searchText)
    }

    /// Returns whether fresh rows for the current query arrived, so
    /// pull-to-refresh can report a failure honestly (IOS-DD-GUIDES-15).
    @discardableResult
    func refresh() async -> Bool {
        loadGeneration &+= 1
        let generation = loadGeneration
        let key = currentQueryKey
        isLoading = true
        errorMessage = nil
        offset = 0

        let isOffline = !NetworkMonitor.shared.isConnected

        // Offline cold start: serve the cached first page immediately
        // (IOS-COMPLY-004) so the screen isn't a blank/dead end without a network.
        if isDefaultView, articles.isEmpty,
           let cached: [Article] = await cache.get(Self.homeCacheKey, allowStale: isOffline) {
            articles = cached
            loadedQueryKey = key
            hasMore = false
            isLoading = false
        }

        // If we're offline and already showing cached content, don't fall through
        // to a network call that will only fail and clobber the cache with an error.
        if isOffline && isDefaultView && !articles.isEmpty && loadedQueryKey == key {
            isLoading = false
            showingStaleResults = true
            return false
        }

        do {
            let response = try await service.fetchArticles(query: buildQuery())
            // Discard if cancelled or superseded by a newer reset in flight.
            guard !Task.isCancelled, generation == loadGeneration else {
                // Cancelled with nothing newer started: clear the spinner, or
                // leaving mid-refresh leaves it on (IOS-DD-GUIDES-17).
                if generation == loadGeneration { isLoading = false }
                return false
            }
            articles = response.articles
            hasMore = response.hasMore
            loadedQueryKey = key
            showingStaleResults = false
            // Cache the unfiltered first page for offline/cold-start use.
            if isDefaultView {
                await cache.set(Self.homeCacheKey, value: response.articles)
            }
            // Keep Spotlight in sync with what the user is browsing.
            let toIndex = response.articles
            Task { await SpotlightService.shared.indexArticles(toIndex) }
            if generation == loadGeneration { isLoading = false }
            return true
        } catch {
            guard generation == loadGeneration else { return false }
            // Leaving the screen or a newer query cancels this one; that is
            // not an error to show.
            if Self.isCancellation(error) || Task.isCancelled {
                isLoading = false
                return false
            }
            if loadedQueryKey != key {
                // The rows on screen belong to another filter.
                articles = []
                hasMore = false
                errorMessage = error.localizedDescription
            } else if articles.isEmpty {
                errorMessage = error.localizedDescription
                hasMore = false
            } else {
                showingStaleResults = true
            }
            isLoading = false
            return false
        }
    }

    nonisolated static func isCancellation(_ error: Error) -> Bool {
        error is CancellationError || (error as? URLError)?.code == .cancelled
    }

    func loadMoreIfNeeded(currentItem: Article) async {
        // Not while a reset is loading: its offset is 0 and the page would be
        // appended to rows that are about to be replaced (IOS-DD-GUIDES-17).
        guard !isLoadingMore, !isLoading, hasMore else { return }
        guard let idx = articles.firstIndex(where: { $0.id == currentItem.id }),
              idx >= articles.count - 5 else { return }

        isLoadingMore = true
        let generation = loadGeneration
        let startOffset = articles.count
        offset = startOffset

        do {
            let response = try await service.fetchArticles(query: buildQuery())
            // A reset ran, or the list changed, while this page was in flight
            // — discard the stale page.
            guard generation == loadGeneration, articles.count == startOffset else {
                isLoadingMore = false
                return
            }
            articles += response.articles
            hasMore = response.hasMore
        } catch {
            if generation == loadGeneration, !Self.isCancellation(error) { hasMore = false }
        }

        isLoadingMore = false
    }

    func clearFilters() {
        searchText = ""
        selectedCategory = nil
        resetAndFetch()
    }

    // MARK: - Private

    private func buildQuery() -> ArticlesService.ArticlesQuery {
        ArticlesService.ArticlesQuery(
            searchText: searchText.trimmingCharacters(in: .whitespaces).isEmpty
                ? nil : searchText.trimmingCharacters(in: .whitespaces),
            category: selectedCategory,
            limit: pageSize,
            offset: offset
        )
    }

    /// Single debounced entry point for search + the category filter; cancels any
    /// pending fetch so a burst collapses to one request and the newest wins.
    private func resetAndFetch() {
        fetchTask?.cancel()
        // Supersede any in-flight refresh now, not after the debounce, so its
        // late result or error can't land on the new query (IOS-DD-GUIDES-17).
        loadGeneration &+= 1
        fetchTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await self?.refresh()
        }
    }
}
