import XCTest
@testable import DesMoinesInsider

/// IOS-DD-BROWSE-14 / 15: cancellation is not failure, a failed refresh keeps
/// the list, the count is the server's, and Clear filters leaves the search.
@MainActor
final class AttractionsViewModelTests: XCTestCase {

    /// Answers each page by offset; a page can be made to throw.
    private final class StubAttractions: AttractionSearchProviding, @unchecked Sendable {
        var rows: [Attraction] = (0..<70).map { Attraction(id: "a\($0)", name: "Place \($0)", type: "Museum") }
        var totalCount = 70
        var pageError: [Int: Error] = [:]
        var refreshError: Error?

        func fetchAttractions(
            query: AttractionsService.AttractionsQuery
        ) async throws -> AttractionsService.AttractionsResponse {
            if query.offset == 0, let refreshError { throw refreshError }
            if let error = pageError[query.offset] { throw error }
            let page = Array(rows.dropFirst(query.offset).prefix(query.limit))
            return .init(
                attractions: page,
                totalCount: totalCount,
                hasMore: query.offset + page.count < totalCount
            )
        }
    }

    private func loaded(_ stub: StubAttractions) async -> AttractionsViewModel {
        let vm = AttractionsViewModel(service: stub)
        await vm.loadInitialData()
        return vm
    }

    func testCancelledPageDoesNotEndPagination() async throws {
        let stub = StubAttractions()
        let vm = await loaded(stub)
        try XCTSkipIf(!vm.hasMore, "page size covers the stub")
        stub.pageError[vm.attractions.count] = URLError(.cancelled)

        await vm.loadMoreIfNeeded(currentItem: try XCTUnwrap(vm.attractions.last))

        XCTAssertTrue(vm.hasMore)
        XCTAssertFalse(vm.loadMoreFailed)
        XCTAssertNil(vm.errorMessage)
    }

    func testFailedPageOffersARetry() async throws {
        let stub = StubAttractions()
        let vm = await loaded(stub)
        try XCTSkipIf(!vm.hasMore, "page size covers the stub")
        stub.pageError[vm.attractions.count] = URLError(.timedOut)

        await vm.loadMoreIfNeeded(currentItem: try XCTUnwrap(vm.attractions.last))

        XCTAssertTrue(vm.hasMore)
        XCTAssertTrue(vm.loadMoreFailed)
    }

    func testFailedRefreshKeepsTheRows() async {
        let stub = StubAttractions()
        let vm = await loaded(stub)
        let before = vm.attractions.map(\.id)
        XCTAssertFalse(before.isEmpty)

        stub.refreshError = URLError(.timedOut)
        await vm.refresh()

        XCTAssertEqual(vm.attractions.map(\.id), before)
        XCTAssertNotNil(vm.errorMessage)
    }

    func testCancelledRefreshIsNotAnError() async {
        let stub = StubAttractions()
        stub.refreshError = CancellationError()
        let vm = AttractionsViewModel(service: stub)
        await vm.refresh()
        XCTAssertNil(vm.errorMessage)
        XCTAssertFalse(vm.hasLoadedOnce)
    }

    func testTotalCountIsTheServers() async {
        let stub = StubAttractions()
        stub.totalCount = 95
        let vm = await loaded(stub)
        XCTAssertEqual(vm.totalCount, 95)
    }

    func testClearFiltersKeepsTheSearchText() {
        let vm = AttractionsViewModel(service: StubAttractions())
        vm.searchText = "zoo"
        vm.selectedTypes = [.museum]
        vm.minRating = 4
        vm.featuredOnly = true
        vm.freeOnly = true

        vm.clearFilters()

        XCTAssertEqual(vm.searchText, "zoo")
        XCTAssertTrue(vm.selectedTypes.isEmpty)
        XCTAssertEqual(vm.minRating, 0)
        XCTAssertFalse(vm.featuredOnly)
        XCTAssertFalse(vm.freeOnly)
        XCTAssertEqual(vm.activeFilterCount, 0)
    }
}
