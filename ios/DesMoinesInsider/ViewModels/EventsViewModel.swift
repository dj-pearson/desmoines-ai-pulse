import Foundation

/// ViewModel for the home/events feed. Handles fetching, filtering, and pagination.
@MainActor
@Observable
final class EventsViewModel {
    // MARK: - State

    private(set) var events: [Event] = []
    private(set) var featuredEvents: [Event] = []
    private(set) var isLoading = false
    private(set) var isLoadingMore = false
    private(set) var hasMore = false
    private(set) var totalCount = 0
    private(set) var errorMessage: String?

    // MARK: - Filters

    var searchText = "" {
        didSet { resetAndFetch() }
    }
    var selectedCategory: EventCategory? {
        didSet { resetAndFetch() }
    }
    var selectedDatePreset: DateFilterPreset? {
        didSet { resetAndFetch() }
    }
    var showFeaturedOnly = false {
        didSet { resetAndFetch() }
    }

    // MARK: - Pagination

    private var currentOffset = 0
    private let pageSize = Config.defaultPageSize
    private var fetchTask: Task<Void, Never>?

    private let service = EventsService.shared

    // MARK: - Initial Load

    func loadInitialData() async {
        guard events.isEmpty else { return }
        await fetchEvents(reset: true)
        await fetchFeaturedEvents()
    }

    func refresh() async {
        await fetchEvents(reset: true)
        await fetchFeaturedEvents()
    }

    // MARK: - Fetch Events

    func fetchEvents(reset: Bool = false) async {
        if reset {
            currentOffset = 0
            isLoading = true
        } else {
            isLoadingMore = true
        }
        errorMessage = nil

        do {
            var query = EventsService.EventsQuery()
            query.searchText = searchText.isEmpty ? nil : searchText
            query.category = selectedCategory?.rawValue
            query.isFeatured = showFeaturedOnly ? true : nil
            query.limit = pageSize
            query.offset = currentOffset

            if let preset = selectedDatePreset {
                let range = preset.dateRange
                query.dateStart = range.start
                query.dateEnd = range.end
            }

            let response = try await service.fetchEvents(query: query)

            if reset {
                events = response.events
            } else {
                events.append(contentsOf: response.events)
            }

            totalCount = response.totalCount
            hasMore = response.hasMore
            currentOffset = events.count
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
        isLoadingMore = false
    }

    // MARK: - Load More

    func loadMoreIfNeeded(currentItem: Event?) async {
        guard let currentItem,
              hasMore,
              !isLoadingMore,
              let index = events.firstIndex(where: { $0.id == currentItem.id }),
              index >= events.count - 5 else { return }

        await fetchEvents(reset: false)
    }

    // MARK: - Featured Events

    private func fetchFeaturedEvents() async {
        do {
            featuredEvents = try await service.fetchFeaturedEvents()
        } catch {
            featuredEvents = []
        }
    }

    // MARK: - Filter Management

    var activeFilterCount: Int {
        var count = 0
        if selectedCategory != nil { count += 1 }
        if selectedDatePreset != nil { count += 1 }
        if showFeaturedOnly { count += 1 }
        if !searchText.isEmpty { count += 1 }
        return count
    }

    func clearFilters() {
        selectedCategory = nil
        selectedDatePreset = nil
        showFeaturedOnly = false
        searchText = ""
    }

    // MARK: - Debounced Search

    private func resetAndFetch() {
        fetchTask?.cancel()
        fetchTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await fetchEvents(reset: true)
        }
    }
}
