import XCTest
@testable import DesMoinesInsider

/// IOS-DD-DISCOVER-09: the unsent swipe queue belongs to one account and
/// stays bounded.
///
/// Guest swipes were queued with no owner, never sent, never capped, and then
/// uploaded under whichever account signed in next on the device. Sign-out
/// never cleared the queue either.
final class SwipeQueueHygieneTests: XCTestCase {

    private typealias Row = SwipeInteractionService.PendingSwipe

    private func row(_ id: String, user: String?) -> Row {
        Row(
            itemType: "event",
            itemId: id,
            action: "like",
            sourceContext: nil,
            createdAt: "2026-09-27T00:00:00Z",
            clientEventId: "key-\(id)",
            userId: user
        )
    }

    func testOnlyTheCurrentUsersRowsAndLegacyRowsAreSent() {
        let queue = [row("a", user: "A"), row("b", user: "B"), row("legacy", user: nil)]

        let split = SwipeInteractionService.partitionForFlush(queue, currentUserId: "A")

        XCTAssertEqual(split.send.map(\.itemId), ["a", "legacy"])
        XCTAssertEqual(split.drop.map(\.itemId), ["b"])
    }

    func testTheQueueKeepsTheNewestRows() {
        let queue = (0..<600).map { row("\($0)", user: "A") }

        let trimmed = SwipeInteractionService.trimmedQueue(queue, cap: SwipeInteractionService.maxPending)

        XCTAssertEqual(SwipeInteractionService.maxPending, 500)
        XCTAssertEqual(trimmed.count, 500)
        XCTAssertEqual(trimmed.first?.itemId, "100")
        XCTAssertEqual(trimmed.last?.itemId, "599")
    }

    func testARowQueuedBeforeTheOwnerFieldStillDecodes() throws {
        // The queue in UserDefaults is a stored schema (CLAUDE.md): a row an
        // earlier build wrote has no userId and must not fail to decode.
        let json = #"[{"itemType":"event","itemId":"e1","action":"like","createdAt":"2026-08-01T00:00:00Z","clientEventId":"k1"}]"#

        let rows = try JSONDecoder().decode([Row].self, from: Data(json.utf8))

        XCTAssertEqual(rows.count, 1)
        XCTAssertNil(rows.first?.userId)
        XCTAssertEqual(rows.first?.clientEventId, "k1")
    }
}
