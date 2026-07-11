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
        async let refreshLoad: Void = refresh()
        _ = await (categoriesLoad, refreshLoad)
    }

    private func loadCategories() async {
        categories = await service.fetchCategories()
    }

    func refresh() async {
        loadGeneration &+= 1
        let generation = loadGeneration
        isLoading = true
        errorMessage = nil
        offset = 0

        let isOffline = !NetworkMonitor.shared.isConnected

        // Offline cold start: serve the cached first page immediately
        // (IOS-COMPLY-004) so the screen isn't a blank/dead end without a network.
        if isDefaultView, articles.isEmpty,
           let cached: [Article] = await cache.get(Self.homeCacheKey, allowStale: isOffline) {
            articles = cached
            hasMore = false
            isLoading = false
        }

        // If we're offline and already showing cached content, don't fall through
        // to a network call that will only fail and clobber the cache with an error.
        if isOffline && isDefaultView && !articles.isEmpty {
            isLoading = false
            return
        }

        do {
            let response = try await service.fetchArticles(query: buildQuery())
            // Discard if cancelled or superseded by a newer reset in flight.
            guard !Task.isCancelled, generation == loadGeneration else { return }
            articles = response.articles
            hasMore = response.hasMore
            // Cache the unfiltered first page for offline/cold-start use.
            if isDefaultView {
                await cache.set(Self.homeCacheKey, value: response.articles)
            }
            // Keep Spotlight in sync with what the user is browsing.
            let toIndex = response.articles
            Task { await SpotlightService.shared.indexArticles(toIndex) }
        } catch {
            // Don't overwrite cached content (already shown) with an error.
            if generation == loadGeneration, articles.isEmpty {
                errorMessage = error.localizedDescription
                hasMore = false
            }
        }

        if generation == loadGeneration { isLoading = false }
    }

    func loadMoreIfNeeded(currentItem: Article) async {
        guard !isLoadingMore, hasMore else { return }
        guard let idx = articles.firstIndex(where: { $0.id == currentItem.id }),
              idx >= articles.count - 5 else { return }

        isLoadingMore = true
        let generation = loadGeneration
        offset = articles.count

        do {
            let response = try await service.fetchArticles(query: buildQuery())
            // A reset ran while this page was in flight — discard the stale page.
            guard generation == loadGeneration else { isLoadingMore = false; return }
            articles += response.articles
            hasMore = response.hasMore
        } catch {
            if generation == loadGeneration { hasMore = false }
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
            searchText: searchText.trimmingCharacters(in: .whitespaces).isEmpty ? nil : searchText,
            category: selectedCategory,
            limit: pageSize,
            offset: offset
        )
    }

    /// Single debounced entry point for search + the category filter; cancels any
    /// pending fetch so a burst collapses to one request and the newest wins.
    private func resetAndFetch() {
        fetchTask?.cancel()
        fetchTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await self?.refresh()
        }
    }
}
