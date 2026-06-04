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
    private let pageSize = Config.defaultPageSize
    private var offset = 0
    private var searchTask: Task<Void, Never>?

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

        do {
            let response = try await service.fetchArticles(query: buildQuery())
            articles = response.articles
            hasMore = response.hasMore
            // Keep Spotlight in sync with what the user is browsing.
            let toIndex = response.articles
            Task { await SpotlightService.shared.indexArticles(toIndex) }
        } catch {
            errorMessage = error.localizedDescription
            articles = []
            hasMore = false
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
