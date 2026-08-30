import XCTest
@testable import DesMoinesInsider

final class SponsoredArrangerTests: XCTestCase {

    private struct Item: Equatable {
        let id: Int
        let sponsored: Bool
    }

    private func arrange(_ items: [Item], maxFront: Int = 2) -> [Int] {
        SponsoredArranger.arrange(items, isSponsored: { $0.sponsored }, maxFront: maxFront).map(\.id)
    }

    func testNoSponsoredLeavesOrderUnchanged() {
        let items = [Item(id: 1, sponsored: false), Item(id: 2, sponsored: false), Item(id: 3, sponsored: false)]
        XCTAssertEqual(arrange(items), [1, 2, 3])
    }

    func testSponsoredPulledToFrontPreservingRelativeOrder() {
        let items = [
            Item(id: 1, sponsored: false),
            Item(id: 2, sponsored: true),
            Item(id: 3, sponsored: false),
            Item(id: 4, sponsored: true),
        ]
        // Both sponsored (2, 4) move to the front in original order; 1, 3 follow.
        XCTAssertEqual(arrange(items), [2, 4, 1, 3])
    }

    func testFrontCapIsRespected() {
        let items = [
            Item(id: 1, sponsored: true),
            Item(id: 2, sponsored: true),
            Item(id: 3, sponsored: true),
            Item(id: 4, sponsored: false),
        ]
        // Only the first two sponsored are promoted; the third stays in place.
        XCTAssertEqual(arrange(items, maxFront: 2), [1, 2, 3, 4])
    }

    func testSingleItemReturnedAsIs() {
        let items = [Item(id: 9, sponsored: true)]
        XCTAssertEqual(arrange(items), [9])
    }

    func testZeroMaxFrontDisablesArrangement() {
        let items = [Item(id: 1, sponsored: false), Item(id: 2, sponsored: true)]
        XCTAssertEqual(arrange(items, maxFront: 0), [1, 2])
    }
}
