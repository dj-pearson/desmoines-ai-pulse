import XCTest
@testable import DesMoinesInsider

/// IOS-DD-RESTAURANTS-02 / 04 / 13 / 14: the Dining list under overlapping
/// requests, Open Now's auto-fill, the fuzzy fallback and the cache key.
///
/// Requests are held open with FakeRestaurantFeed and completed out of order,
/// the only way to show the generation token works.
@MainActor
final class RestaurantsViewModelPagingTests: XCTestCase {

    typealias Feed = FakeRestaurantFeed

    private func loadedViewModel(_ fake: Feed, total: Int = 90) async -> RestaurantsViewModel {
        let vm = RestaurantsViewModel(service: fake)
        let first = Task { await vm.fetchRestaurants(reset: true) }
        _ = await waitUntil { fake.queries.count == 1 }
        fake.resume(0, with: .success(Feed.page(0..<30, total: total)))
        await first.value
        return vm
    }

    // MARK: - 1: a stale load-more never lands after a refresh

    func testAStaleLoadMoreIsDroppedAfterARefresh() async {
        let fake = Feed()
        let vm = await loadedViewModel(fake)
        XCTAssertEqual(vm.restaurants.count, 30)

        vm.loadMoreIfNeeded(currentItem: vm.arrangedRestaurants.last)
        let started = await waitUntil { fake.queries.count == 2 }
        XCTAssertTrue(started)
        XCTAssertEqual(fake.queries[1].offset, 30)

        let refresh = Task { await vm.refresh() }
        let refreshing = await waitUntil { fake.queries.count == 3 }
        XCTAssertTrue(refreshing)
        XCTAssertEqual(fake.queries[2].offset, 0)

        // The refresh answers first, then the stale load-more.
        fake.resume(2, with: .success(Feed.page(100..<130, total: 90)))
        _ = await refresh.value
        fake.resume(1, with: .success(Feed.page(200..<230, total: 90)))
        await settle()

        XCTAssertEqual(vm.restaurants.count, 30)
        XCTAssertEqual(vm.restaurants.first?.id, "r100")
        XCTAssertFalse(vm.restaurants.contains { $0.id == "r200" })
        XCTAssertFalse(vm.isLoadingMore)
    }

    // MARK: - 2: a failed refilter keeps the rows and says so

    func testAFailedRefilterKeepsRowsAndReportsTheError() async {
        let fake = Feed()
        let vm = await loadedViewModel(fake)

        let refresh = Task { await vm.refresh() }
        let started = await waitUntil { fake.queries.count == 2 }
        XCTAssertTrue(started)
        fake.resume(1, with: .failure(URLError(.timedOut)))
        let succeeded = await refresh.value

        XCTAssertFalse(succeeded, "the pull-to-refresh haptic must not report success")
        XCTAssertNotNil(vm.errorMessage)
        XCTAssertTrue(vm.lastFetchFailed)
        XCTAssertEqual(vm.restaurants.count, 30)
    }

    // MARK: - 3: cancellation is not an error

    func testCancellationLeavesNoErrorAndClearsLoading() async {
        let fake = Feed()
        let vm = RestaurantsViewModel(service: fake)
        let fetch = Task { await vm.fetchRestaurants(reset: true) }
        let started = await waitUntil { fake.queries.count == 1 }
        XCTAssertTrue(started)
        XCTAssertTrue(vm.isLoading)

        fake.resume(0, with: .failure(CancellationError()))
        await fetch.value

        XCTAssertNil(vm.errorMessage)
        XCTAssertFalse(vm.isLoading)
    }

    // MARK: - 4: only the first page is sponsor-arranged

    func testASponsoredRowOnPageTwoDoesNotJumpToTheTop() async {
        let fake = Feed()
        let vm = await loadedViewModel(fake, total: 60)

        vm.loadMoreIfNeeded(currentItem: vm.arrangedRestaurants.last)
        let started = await waitUntil { fake.queries.count == 2 }
        XCTAssertTrue(started)
        var page2 = (30..<60).map { Feed.restaurant("r\($0)") }
        page2[10] = Feed.restaurant("r40", sponsored: true)
        fake.resume(1, with: .success(Feed.page(page2, total: 60, hasMore: false)))
        let appended = await waitUntil { vm.restaurants.count == 60 }
        XCTAssertTrue(appended)

        let index = vm.arrangedRestaurants.firstIndex { $0.id == "r40" }
        XCTAssertNotNil(index)
        XCTAssertGreaterThan(index ?? 0, 29)
    }

    // MARK: - 5: a row that shifts pages is shown once

    func testADuplicateIdAcrossPagesIsAppendedOnce() async {
        let fake = Feed()
        let vm = await loadedViewModel(fake, total: 60)

        vm.loadMoreIfNeeded(currentItem: vm.arrangedRestaurants.last)
        let started = await waitUntil { fake.queries.count == 2 }
        XCTAssertTrue(started)
        // r29 ended page one and comes back first on page two.
        fake.resume(1, with: .success(Feed.page(29..<59, total: 60)))
        let done = await waitUntil { !vm.isLoadingMore && vm.restaurants.count > 30 }
        XCTAssertTrue(done)

        XCTAssertEqual(vm.restaurants.count, 59)
        XCTAssertEqual(Set(vm.restaurants.map(\.id)).count, 59)
    }

    // MARK: - 6: one rotation seed per list

    func testEveryPageOfAListCarriesTheSameRotationSeed() async {
        let fake = Feed()
        let vm = await loadedViewModel(fake)

        vm.loadMoreIfNeeded(currentItem: vm.arrangedRestaurants.last)
        let started = await waitUntil { fake.queries.count == 2 }
        XCTAssertTrue(started)

        XCTAssertNotNil(fake.queries[0].rotationSeed)
        XCTAssertEqual(fake.queries[0].rotationSeed, fake.queries[1].rotationSeed)
        fake.resume(1, with: .success(Feed.page(30..<60, total: 90)))
    }

    // MARK: - Open Now auto-fill (IOS-DD-RESTAURANTS-04)

    func testOpenNowLoadsFurtherPagesItselfThenStops() async {
        // Rows with no hours are never "open", so every page adds nothing.
        let fake = Feed { query in
            .success(Feed.page(query.offset..<(query.offset + 30), total: 1000))
        }
        let vm = RestaurantsViewModel(service: fake)
        vm.showOpenNowOnly = true
        await vm.fetchRestaurants(reset: true)

        let filled = await waitUntil { fake.queries.count == 1 + RestaurantsViewModel.maxAutoFillPages }
        XCTAssertTrue(filled)
        await settle()
        await settle()
        XCTAssertEqual(fake.queries.count, 1 + RestaurantsViewModel.maxAutoFillPages, "stops after the cap")
        XCTAssertTrue(vm.restaurants.isEmpty)
        XCTAssertFalse(vm.isAutoFilling)
        XCTAssertEqual(fake.queries.last?.offset, 30 * RestaurantsViewModel.maxAutoFillPages)
    }

    func testOpenNowStopsWhenThereAreNoMorePages() async {
        let fake = Feed { query in
            .success(Feed.page(query.offset..<(query.offset + 30), total: 60, hasMore: query.offset == 0))
        }
        let vm = RestaurantsViewModel(service: fake)
        vm.showOpenNowOnly = true
        await vm.fetchRestaurants(reset: true)

        let filled = await waitUntil { fake.queries.count == 2 }
        XCTAssertTrue(filled)
        await settle()
        XCTAssertEqual(fake.queries.count, 2)
    }

    // MARK: - Dietary is server-side (IOS-DD-RESTAURANTS-04)

    func testDietaryIsSentAndNotFilteredLocally() async {
        let fake = Feed { _ in .success(Feed.page(0..<5, total: 5, hasMore: false)) }
        let vm = RestaurantsViewModel(service: fake)
        vm.selectedDietary = ["vegan"]
        let fetched = await waitUntil { vm.restaurants.count == 5 }

        XCTAssertTrue(fetched, "no row mentions vegan, and none is dropped on the device")
        XCTAssertEqual(fake.queries.last?.dietary, ["vegan"])
    }

    // MARK: - Fuzzy fallback (IOS-DD-RESTAURANTS-13)

    func testAnEmptySearchFallsBackToFuzzyMatches() async {
        let fake = Feed { _ in .success(Feed.page([Restaurant](), total: 0, hasMore: false)) }
        fake.fuzzyResult = [Feed.restaurant("r1")]
        let vm = RestaurantsViewModel(service: fake)
        vm.searchText = "harbingr"
        let shown = await waitUntil { vm.isFuzzyFallback }

        XCTAssertTrue(shown)
        XCTAssertEqual(vm.restaurants.map(\.id), ["r1"])
        XCTAssertEqual(fake.fuzzyQueries, ["harbingr"])
        XCTAssertFalse(vm.hasMore)
    }

    func testNoFuzzyFallbackWhenAnotherFilterIsSet() async {
        let fake = Feed { _ in .success(Feed.page([Restaurant](), total: 0, hasMore: false)) }
        fake.fuzzyResult = [Feed.restaurant("r1")]
        let vm = RestaurantsViewModel(service: fake)
        vm.selectedCuisines = ["Italian"]
        vm.searchText = "harbingr"
        let fetched = await waitUntil { fake.queries.contains { $0.searchText == "harbingr" } }
        XCTAssertTrue(fetched)
        await settle()

        XCTAssertTrue(fake.fuzzyQueries.isEmpty)
        XCTAssertFalse(vm.isFuzzyFallback)
    }

    // MARK: - Cache key (IOS-DD-RESTAURANTS-14)

    private func key(search: String = "", dietary: Set<String> = []) -> String? {
        RestaurantsViewModel.cacheKey(
            searchText: search, cuisines: [], priceRanges: [], locations: [], dietary: dietary,
            minRating: 0, featuredOnly: false, newOpeningsOnly: false, sortBy: .popularity
        )
    }

    func testASearchIsNeverCached() {
        XCTAssertNil(key(search: "zombie burger"))
    }

    func testDietaryIsInTheKey() {
        let k = key(dietary: ["vegan"])
        XCTAssertNotNil(k)
        XCTAssertTrue(k?.contains("d-vegan") ?? false)
        XCTAssertFalse(k?.contains("zombie") ?? true)
    }
}
