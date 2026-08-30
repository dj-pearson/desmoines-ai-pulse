import XCTest
@testable import DesMoinesInsider

/// IOS-AUDIT-BUG-017 -- the queued-key backfill.
///
/// The queue lives in UserDefaults, which CLAUDE.md treats as a stored schema:
/// adding a REQUIRED field to PendingSwipe would make every entry written by an
/// earlier build fail to decode, and loadPending returns [] on a decode failure,
/// so the whole backlog would vanish with nothing logged. These tests pin both
/// halves of avoiding that - old rows survive, and they get a key exactly once.
@MainActor
final class SwipeIdempotencyTests: XCTestCase {

    private let key = "test.pendingSwipes.idempotency"

    override func setUp() {
        super.setUp()
        UserDefaults.standard.removeObject(forKey: key)
    }

    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: key)
        super.tearDown()
    }

    /// A queue exactly as a build predating client_event_id would have written it.
    private func seedLegacyQueue(count: Int) {
        let rows = (0..<count).map { i in
            """
            {"itemType":"event","itemId":"id-\(i)","action":"like","createdAt":"2026-08-01T00:00:00Z"}
            """
        }
        let json = "[\(rows.joined(separator: ","))]"
        UserDefaults.standard.set(Data(json.utf8), forKey: key)
    }

    func testLegacyRowsSurviveAndGetAKey() {
        seedLegacyQueue(count: 3)
        XCTAssertEqual(SwipeInteractionService.backfillEventIds(key), 3)
    }

    func testBackfillIsIdempotent() {
        // The second call must find nothing to do. If it re-minted, every flush
        // would send the same row under a new key and the dedupe would never
        // fire - the exact failure this story is about, reintroduced.
        seedLegacyQueue(count: 2)
        XCTAssertEqual(SwipeInteractionService.backfillEventIds(key), 2)
        XCTAssertEqual(SwipeInteractionService.backfillEventIds(key), 0)
    }

    func testAnEmptyQueueNeedsNoWork() {
        XCTAssertEqual(SwipeInteractionService.backfillEventIds(key), 0)
    }

    func testAQueueThatCannotBeDecodedIsNotMistakenForAFilledOne() {
        // loadPending returns [] on garbage, so backfill reports 0. That is the
        // right answer, and the test exists so the 0 above is not read as proof
        // the rows were fine.
        UserDefaults.standard.set(Data("not json".utf8), forKey: key)
        XCTAssertEqual(SwipeInteractionService.backfillEventIds(key), 0)
    }
}
