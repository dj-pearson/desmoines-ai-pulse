import XCTest
@testable import DesMoinesInsider

/// IOS-DD-EVENTS-03 / 09 / 19: the Home feed under overlapping requests.
///
/// Each case holds a request open with FakeEventFeed and completes it out of
/// order, which is the situation the generation token exists for and the only
/// way to show it works.
@MainActor
final class EventsViewModelPagingTests: XCTestCase {

    private func loadedViewModel(_ fake: FakeEventFeed, total: Int = 90) async -> EventsViewModel {
        let vm = EventsViewModel(service: fake, loadsFeatured: false)
        let first = Task { await vm.fetchEvents(reset: true) }
        _ = await waitUntil { fake.queries.count == 1 }
        fake.resume(0, with: .success(FakeEventFeed.page(0..<30, total: total)))
        await first.value
        return vm
    }

    // MARK: - A: a stale load-more never lands after a reset

    func testAStaleLoadMoreIsDroppedAndPagingRestartsFromTheNewFirstPage() async {
        let fake = FakeEventFeed()
        let vm = await loadedViewModel(fake)
        XCTAssertEqual(vm.events.count, 30)

        vm.loadMoreIfNeeded(currentItem: vm.arrangedEvents.last)
        let ok1 = await waitUntil { fake.queries.count == 2 }
        XCTAssertTrue(ok1)
        XCTAssertEqual(fake.queries[1].offset, 30)

        let refresh = Task { await vm.refresh() }
        let ok2 = await waitUntil { fake.queries.count == 3 }
        XCTAssertTrue(ok2)
        XCTAssertEqual(fake.queries[2].offset, 0)

        // The reset answers first, then the stale load-more.
        fake.resume(2, with: .success(FakeEventFeed.page(100..<130, total: 90)))
        await refresh.value
        fake.resume(1, with: .success(FakeEventFeed.page(200..<230, total: 90)))
        await settle() // let the stale task finish

        XCTAssertEqual(vm.events.count, 30)
        XCTAssertEqual(vm.events.first?.id, "e100")
        XCTAssertFalse(vm.events.contains { $0.id == "e200" })
        XCTAssertFalse(vm.isLoadingMore)

        vm.loadMoreIfNeeded(currentItem: vm.arrangedEvents.last)
        let ok3 = await waitUntil { fake.queries.count == 4 }
        XCTAssertTrue(ok3)
        XCTAssertEqual(fake.queries[3].offset, 30, "offset restarts from the new first page")
    }

    // MARK: - B: a filter change retires the in-flight page at once

    func testStaleLoadMoreRowsNeverAppearAfterAFilterChange() async {
        let fake = FakeEventFeed()
        let vm = await loadedViewModel(fake)

        vm.loadMoreIfNeeded(currentItem: vm.arrangedEvents.last)
        let ok4 = await waitUntil { fake.queries.count == 2 }
        XCTAssertTrue(ok4)

        vm.selectedCategory = .music
        // Answer the old page during the debounce.
        fake.resume(1, with: .success(FakeEventFeed.page(300..<330, total: 90)))
        await settle()
        XCTAssertFalse(vm.events.contains { $0.id == "e300" })

        let ok5 = await waitUntil { fake.queries.count == 3 }

        XCTAssertTrue(ok5)
        XCTAssertEqual(fake.queries[2].category, "Music")
        fake.resume(2, with: .success(FakeEventFeed.page(400..<405, total: 5, hasMore: false)))
        let ok6 = await waitUntil { vm.events.first?.id == "e400" }
        XCTAssertTrue(ok6)
        XCTAssertEqual(vm.events.count, 5)
        XCTAssertFalse(vm.events.contains { $0.id == "e300" })
    }

    // MARK: - C: cancellation is not an error

    func testCancellationLeavesNoErrorAndClearsLoading() async {
        let fake = FakeEventFeed()
        let vm = EventsViewModel(service: fake, loadsFeatured: false)
        let fetch = Task { await vm.fetchEvents(reset: true) }
        let ok7 = await waitUntil { fake.queries.count == 1 }
        XCTAssertTrue(ok7)
        XCTAssertTrue(vm.isLoading)

        fake.resume(0, with: .failure(CancellationError()))
        await fetch.value

        XCTAssertNil(vm.errorMessage)
        XCTAssertFalse(vm.isLoading)
        XCTAssertTrue(vm.events.isEmpty)
    }

    // MARK: - D: a row that shifts pages is shown once

    func testADuplicateIdAcrossPagesIsAppendedOnce() async {
        let fake = FakeEventFeed()
        let vm = await loadedViewModel(fake, total: 60)

        vm.loadMoreIfNeeded(currentItem: vm.arrangedEvents.last)
        let ok8 = await waitUntil { fake.queries.count == 2 }
        XCTAssertTrue(ok8)
        // e29 was the last row of page one and comes back first on page two.
        fake.resume(1, with: .success(FakeEventFeed.page(29..<59, total: 60)))
        let ok9 = await waitUntil { !vm.isLoadingMore }
        XCTAssertTrue(ok9)

        XCTAssertEqual(vm.events.count, 59)
        XCTAssertEqual(Set(vm.events.map(\.id)).count, 59)
    }

    // MARK: - E09: a failed refilter is reported, rows kept

    func testAFailedResetWithRowsOnScreenReportsTheError() async {
        let fake = FakeEventFeed()
        let vm = await loadedViewModel(fake)

        let refresh = Task { await vm.refresh() }
        let ok10 = await waitUntil { fake.queries.count == 2 }
        XCTAssertTrue(ok10)
        XCTAssertTrue(vm.isRefiltering)
        fake.resume(1, with: .failure(URLError(.notConnectedToInternet)))
        await refresh.value

        XCTAssertNotNil(vm.errorMessage)
        XCTAssertEqual(vm.events.count, 30)
        XCTAssertTrue(vm.lastFetchFailed)
        XCTAssertFalse(vm.isRefiltering)
    }

    // MARK: - E19: fuzzy fallback

    func testAnEmptySearchFallsBackToFuzzyMatches() async {
        let fake = FakeEventFeed(immediate: .success(FakeEventFeed.page([String](), total: 0, hasMore: false)))
        fake.fuzzyResult = [FakeEventFeed.event("jazz1"), FakeEventFeed.event("jazz2")]
        let vm = EventsViewModel(service: fake, loadsFeatured: false)

        vm.searchText = "jaz"
        await vm.fetchEvents(reset: true)

        XCTAssertEqual(vm.events.count, 2)
        XCTAssertTrue(vm.isFuzzyFallback)
        XCTAssertFalse(vm.hasMore)
        XCTAssertEqual(fake.fuzzyQueries.last, "jaz")
    }

    func testNoFuzzyFallbackWhenAnotherFilterIsSet() async {
        let fake = FakeEventFeed(immediate: .success(FakeEventFeed.page([String](), total: 0, hasMore: false)))
        fake.fuzzyResult = [FakeEventFeed.event("jazz1")]
        let vm = EventsViewModel(service: fake, loadsFeatured: false)

        vm.searchText = "jaz"
        vm.showFreeOnly = true
        await vm.fetchEvents(reset: true)

        XCTAssertTrue(vm.events.isEmpty)
        XCTAssertFalse(vm.isFuzzyFallback)
    }
}
