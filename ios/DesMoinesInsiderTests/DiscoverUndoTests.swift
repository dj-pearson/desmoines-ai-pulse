import XCTest
@testable import DesMoinesInsider

/// IOS-DD-DISCOVER-07: the last few swipes can be taken back.
///
/// A swipe used to be final: the "seen" key was persisted, a like wrote a
/// favorite, and there was no rewind. Undo puts the card back on top, backs out
/// the like, and removes a favorite only if that like created it.
@MainActor
final class DiscoverUndoTests: XCTestCase {

    private typealias Fake = FakeDiscoverEvents

    private func loadedViewModel(
        removeFavorite: @escaping @MainActor (SwipeItem) async -> Void = { _ in }
    ) async -> DiscoverViewModel {
        let vm = DiscoverViewModel.testing(
            events: Fake(events: ["1", "2", "3"].map { Fake.event($0) }),
            removeFavorite: removeFavorite
        )
        await vm.reload()
        return vm
    }

    func testUndoingASkipPutsTheCardBackOnTop() async {
        let vm = await loadedViewModel()
        guard let first = vm.deck.first else { return XCTFail("deck should be populated") }

        vm.skip(first)
        XCTAssertEqual(vm.deck.map(\.rawId), ["2", "3"])
        XCTAssertTrue(vm.canUndo)

        vm.undo()

        XCTAssertEqual(vm.deck.map(\.rawId), ["1", "2", "3"])
        XCTAssertFalse(vm.canUndo)
        XCTAssertEqual(vm.totalSwipes, 0)
    }

    func testUndoingALikeTakesItOutOfTheLikes() async {
        let vm = await loadedViewModel()
        guard let first = vm.deck.first else { return XCTFail("deck should be populated") }

        vm.like(first)
        XCTAssertEqual(vm.likedItems.count, 1)

        vm.undo()

        XCTAssertTrue(vm.likedItems.isEmpty)
        XCTAssertEqual(vm.deck.first?.rawId, "1")
    }

    func testUndoingALikeRemovesTheFavoriteItCreated() async {
        var removed: [String] = []
        let vm = await loadedViewModel(removeFavorite: { removed.append($0.rawId) })
        guard let first = vm.deck.first else { return XCTFail("deck should be populated") }

        vm.like(first)
        // Let the save report that it turned the favorite on.
        _ = await waitUntil { vm.undoStack.last?.createdFavorite == true }
        vm.undo()
        _ = await waitUntil { !removed.isEmpty }

        XCTAssertEqual(removed, ["1"])
    }

    func testBoostClearsTheUndoStack() async {
        let vm = await loadedViewModel()
        guard let first = vm.deck.first else { return XCTFail("deck should be populated") }
        vm.skip(first)
        XCTAssertTrue(vm.canUndo)

        guard let next = vm.deck.first else { return XCTFail("deck should still have cards") }
        vm.boost(next)

        XCTAssertFalse(vm.canUndo)
    }

    func testTheUndoStackIsCapped() async {
        let vm = DiscoverViewModel.testing(events: Fake(events: (1...7).map { Fake.event("\($0)") }))
        await vm.reload()

        for _ in 0..<7 {
            guard let top = vm.deck.first else { return XCTFail("ran out of cards") }
            vm.skip(top)
        }

        XCTAssertEqual(vm.undoStack.count, DiscoverViewModel.maxUndo)
        XCTAssertEqual(vm.undoStack.count, 5)
    }
}
