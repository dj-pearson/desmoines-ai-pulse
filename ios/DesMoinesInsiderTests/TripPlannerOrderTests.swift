import XCTest
@testable import DesMoinesInsider

/// IOS-AUDIT-PERF-030, IOS-DD-TRIP-PLANNER-05 -- the arguments of the
/// `reorder_trip_items` RPC.
///
/// The previous upsert of {id, order_index} could never succeed (Postgres
/// checks the NOT NULL columns of the proposed insert row before conflict
/// arbitration). The RPC takes the ids in their new order; these lock the
/// positional contract and the argument names the SQL declares in
/// 20261014000001_trip_planner_storage_d1.sql.
@MainActor
final class TripPlannerOrderTests: XCTestCase {

    /// Decoded rather than built with a memberwise init: TripPlanItem has
    /// eighteen stored properties and adding a nineteenth would break every
    /// test here for no reason. orderIndex is deliberately 0 on every item.
    private func item(_ id: String) -> TripPlanItem {
        let json = """
        {"item_id":"\(id)","day_number":1,"order_index":0,"item_type":"event"}
        """
        // swiftlint:disable:next force_try
        return try! JSONDecoder().decode(TripPlanItem.self, from: Data(json.utf8))
    }

    func testIdsKeepTheirPositionalOrder() {
        let params = TripPlannerService.reorderParams(tripId: "t-1", day: 2, items: [item("c"), item("a"), item("b")])
        XCTAssertEqual(params, .init(p_trip_id: "t-1", p_day: 2, p_item_ids: ["c", "a", "b"]))
    }

    func testEncodedKeysMatchTheSqlArguments() throws {
        let params = TripPlannerService.reorderParams(tripId: "t-1", day: 1, items: [item("a")])
        let data = try JSONEncoder().encode(params)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(Set(object.keys), ["p_trip_id", "p_day", "p_item_ids"])
        XCTAssertEqual(object["p_item_ids"] as? [String], ["a"])
        XCTAssertEqual(object["p_day"] as? Int, 1)
    }

    func testEmptyInputProducesNoIds() {
        XCTAssertTrue(TripPlannerService.reorderParams(tripId: "t", day: 1, items: []).p_item_ids.isEmpty)
    }
}
