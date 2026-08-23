import XCTest
@testable import DesMoinesInsider

/// IOS-AUDIT-TEST-005 AC1 -- the swiped-key pruning cap (IOS-AUDIT-PERF-019).
///
/// This list is persisted to UserDefaults on every swipe and is the answer to
/// "have I already seen this card". A cap that is off by one, or that drops the
/// wrong end, fails in two ways that nothing downstream reports: the blob grows
/// without bound, or the most recently swiped cards start reappearing.
final class SwipeHistoryCapTests: XCTestCase {

    private let cap = SwipeInteractionService.maxSwipedKeys

    private func keys(_ range: Range<Int>) -> [String] {
        range.map { "event:\($0)" }
    }

    // MARK: - Under the cap

    func testAListUnderTheCapIsUntouched() {
        let short = keys(0..<10)
        XCTAssertEqual(SwipeInteractionService.trimmed(short, cap: cap), short)
    }

    func testAListExactlyAtTheCapIsUntouched() {
        // The boundary is where an off-by-one lives. At exactly `cap` nothing
        // should be dropped.
        let exact = keys(0..<cap)
        let trimmed = SwipeInteractionService.trimmed(exact, cap: cap)
        XCTAssertEqual(trimmed.count, cap)
        XCTAssertEqual(trimmed.first, exact.first)
    }

    func testAnEmptyListStaysEmpty() {
        XCTAssertTrue(SwipeInteractionService.trimmed([], cap: cap).isEmpty)
    }

    // MARK: - Over the cap

    func testOneOverTheCapDropsExactlyOne() {
        let over = keys(0..<(cap + 1))
        let trimmed = SwipeInteractionService.trimmed(over, cap: cap)
        XCTAssertEqual(trimmed.count, cap)
        XCTAssertEqual(trimmed.first, "event:1", "the oldest entry should be the one dropped")
        XCTAssertEqual(trimmed.last, "event:\(cap)")
    }

    func testTheOldestEntriesAreDroppedNotTheNewest() {
        // Dropping the newest would make the cards a user just swiped reappear,
        // which is the opposite of what this list is for.
        let over = keys(0..<(cap + 250))
        let trimmed = SwipeInteractionService.trimmed(over, cap: cap)
        XCTAssertEqual(trimmed.count, cap)
        XCTAssertEqual(trimmed.first, "event:250")
        XCTAssertEqual(trimmed.last, "event:\(cap + 249)")
    }

    func testAMuchLongerListIsStillTrimmedToTheCap() {
        // A legacy blob written before the cap existed is trimmed on load.
        XCTAssertEqual(SwipeInteractionService.trimmed(keys(0..<(cap * 3)), cap: cap).count, cap)
    }

    func testOrderIsPreserved() {
        // The set is rebuilt from this array, so a reordering here silently
        // changes nothing observable - and then everything, the moment someone
        // relies on recency.
        let over = keys(0..<(cap + 5))
        let trimmed = SwipeInteractionService.trimmed(over, cap: cap)
        XCTAssertEqual(trimmed, Array(over.suffix(cap)))
    }

    // MARK: - The cap itself

    func testTheCapIsBoundedAndNonZero() {
        // A zero cap would silently disable swipe history; an unbounded one is
        // the leak this exists to prevent.
        XCTAssertGreaterThan(SwipeInteractionService.maxSwipedKeys, 0)
        XCTAssertLessThanOrEqual(SwipeInteractionService.maxSwipedKeys, 10_000)
    }
}
