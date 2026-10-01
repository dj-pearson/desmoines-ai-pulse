import XCTest
@testable import DesMoinesInsider

/// IOS-DD-EVENTS-08: every row-changing filter is in the cache key.
@MainActor
final class EventsViewModelCacheKeyTests: XCTestCase {

    private func viewModel() -> EventsViewModel {
        EventsViewModel(service: FakeEventFeed(immediate: .success(FakeEventFeed.page(0..<0, total: 0))))
    }

    func testFreeOnlyHasItsOwnKey() {
        let vm = viewModel()
        let base = vm.eventsCacheKey()
        vm.showFreeOnly = true
        XCTAssertNotEqual(vm.eventsCacheKey(), base)
    }

    func testAnAreaHasItsOwnKey() {
        let vm = viewModel()
        let base = vm.eventsCacheKey()
        vm.selectedCities = ["Ankeny"]
        XCTAssertNotEqual(vm.eventsCacheKey(), base)
    }

    func testOldKeysAreNeverRead() {
        XCTAssertTrue(viewModel().eventsCacheKey().hasPrefix("events2"))
    }
}

/// IOS-DD-EVENTS-10: a preset chip describes the filters or goes dark.
@MainActor
final class EventsViewModelPresetTests: XCTestCase {

    private func viewModel() -> EventsViewModel {
        EventsViewModel(service: FakeEventFeed(immediate: .success(FakeEventFeed.page(0..<0, total: 0))))
    }

    func testChangingAPresetsFilterClearsTheChip() {
        let vm = viewModel()
        vm.applyPreset(.freeWeekend)
        XCTAssertEqual(vm.activePreset, .freeWeekend)

        vm.showFreeOnly = false
        XCTAssertNil(vm.activePreset)
        XCTAssertEqual(vm.selectedDatePreset, .thisWeekend)
    }

    func testTappingTheDarkPresetReappliesInsteadOfClearing() {
        let vm = viewModel()
        vm.applyPreset(.freeWeekend)
        vm.showFreeOnly = false
        vm.applyPreset(.freeWeekend)
        XCTAssertTrue(vm.showFreeOnly)
        XCTAssertEqual(vm.activePreset, .freeWeekend)
    }

    func testSortingKeepsThePreset() {
        let vm = viewModel()
        vm.applyPreset(.liveMusic)
        vm.sortBy = .popularity
        XCTAssertEqual(vm.activePreset, .liveMusic)
    }

    func testTonightPresetMeansTonight() {
        XCTAssertEqual(EventPreset.tonight.datePreset, .tonight)
    }
}

/// IOS-DD-EVENTS-12: a rail's VM starts on its own window.
@MainActor
final class EventsViewModelInitTests: XCTestCase {

    func testInitialPresetIsAppliedWithoutAFetchOrAPreset() async {
        let fake = FakeEventFeed(immediate: .success(FakeEventFeed.page(0..<0, total: 0)))
        let vm = EventsViewModel(service: fake, initialDatePreset: .thisWeekend, loadsFeatured: false)
        XCTAssertEqual(vm.selectedDatePreset, .thisWeekend)
        XCTAssertFalse(vm.hasLoadedOnce)
        XCTAssertNil(vm.activePreset)
        // No debounced fetch was scheduled by the init.
        try? await Task.sleep(nanoseconds: 450_000_000)
        XCTAssertTrue(fake.queries.isEmpty)
    }

    func testDefaultInitStillCompiles() {
        XCTAssertNil(EventsViewModel(initialDatePreset: .thisWeekend).activePreset)
    }
}
