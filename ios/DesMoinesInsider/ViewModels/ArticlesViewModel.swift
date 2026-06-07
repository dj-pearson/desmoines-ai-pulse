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
            debounceSearch()
        }
    }

    /// `nil` = "All".
    var selectedCategory: String? {
        didSet {
            guard selectedCategory != oldValue else { return }
            Task { await refresh() }
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
    private var searchTask: Task<Void, Never>?

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
        searchTask?.cancel()
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
            if articles.isEmpty {
                errorMessage = error.localizedDescription
                hasMore = false
            }
        }

        isLoading = false
    }

    func loadMoreIfNeeded(currentItem: Article) async {
        guard !isLoadingMore, hasMore else { return }
        guard let idx = articles.firstIndex(where: { $0.id == currentItem.id }),
              idx >= articles.count - 5 else { return }

        isLoadingMore = true
        offset = articles.count

        do {
            let response = try await service.fetchArticles(query: buildQuery())
            articles += response.articles
            hasMore = response.hasMore
        } catch {
            hasMore = false
        }

        isLoadingMore = false
    }

    func clearFilters() {
        searchText = ""
        selectedCategory = nil
        Task { await refresh() }
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

    private func debounceSearch() {
        searchTask?.cancel()
        searchTask = Task { [searchText] in
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            guard self.searchText == searchText else { return }
            await refresh()
        }
    }
}
