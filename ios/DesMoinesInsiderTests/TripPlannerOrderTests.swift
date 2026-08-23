import XCTest
@testable import DesMoinesInsider

/// IOS-AUDIT-PERF-030 AC2/AC3 -- the index assignment behind the bulk reorder.
///
/// persistOrder used to issue one UPDATE per stop and swallow each failure
/// independently, so a dropped connection halfway through left some rows at
/// their new index and the rest at their old one. The network half of the fix is
/// one upsert instead of N; this covers the half that can silently produce a
/// wrong order without failing anything.
@MainActor
final class TripPlannerOrderTests: XCTestCase {

    /// Decoded rather than built with a memberwise init: TripPlanItem has
    /// eighteen stored properties and adding a nineteenth would break every
    /// test here for no reason. orderIndex is deliberately 0 on every item -
    /// see the first test.
    private func item(_ id: String) -> TripPlanItem {
        let json = """
        {"item_id":"\(id)","day_number":1,"order_index":0,"item_type":"event"}
        """
        // swiftlint:disable:next force_try
        return try! JSONDecoder().decode(TripPlanItem.self, from: Data(json.utf8))
    }

    func testIndicesAreThePositionsNotTheStoredOrder() {
        // Every stop is built with orderIndex 0 above, so a row taking its index
        // from the model rather than its position would pass the eye test and
        // write all zeros.
        let rows = TripPlannerService.orderRows(for: [item("a"), item("b"), item("c")])
        XCTAssertEqual(rows.map(\.order_index), [0, 1, 2])
        XCTAssertEqual(rows.map(\.id), ["a", "b", "c"])
    }

    func testReorderingProducesTheNewPositions() {
        let rows = TripPlannerService.orderRows(for: [item("c"), item("a"), item("b")])
        XCTAssertEqual(rows, [
            .init(id: "c", order_index: 0),
            .init(id: "a", order_index: 1),
            .init(id: "b", order_index: 2),
        ])
    }

    func testEmptyInputProducesNoRows() {
        XCTAssertTrue(TripPlannerService.orderRows(for: []).isEmpty)
    }
}
