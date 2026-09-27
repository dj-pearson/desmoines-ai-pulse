import XCTest
@testable import DesMoinesInsider

/// IOS-DD-DISCOVER-17: Surprise Me's service half.
final class SurpriseMeServiceTests: XCTestCase {

    private func pick() throws -> SurpriseMeService.Pick {
        let json = #"{"item_type":"event","item_id":"6F9619FF-8B86-D011-B42D-00C04FC964FF","title":"Show","reason":"Because","reason_template":"upcoming_event"}"#
        return try JSONDecoder().decode(SurpriseMeService.Pick.self, from: Data(json.utf8))
    }

    private func keys(_ value: some Encodable) throws -> Set<String> {
        let data = try JSONEncoder().encode(value)
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return Set(object?.keys.map { $0 } ?? [])
    }

    func testNoRowsIsNoPickNotAnError() {
        // "Nothing to surprise you with" was unreachable: no rows threw.
        XCTAssertNil(SurpriseMeService.firstPick([]))
    }

    func testAnOutcomeRowCarriesTheUser() throws {
        let row = SurpriseMeService.outcomeRow(pick: try pick(), outcome: .opened, userId: UUID())

        let fields = try keys(row)

        XCTAssertTrue(fields.contains("user_id"))
        XCTAssertTrue(fields.contains("outcome"))
        XCTAssertEqual(row.outcome, "opened")
    }

    func testTheExcludeListIsLeftOutWhenEmpty() throws {
        // The shipped two-argument call, until there is something to exclude.
        let fields = try keys(SurpriseMeService.Params(location: nil, excluding: []))
        XCTAssertFalse(fields.contains("p_exclude_ids"))
    }

    func testTheExcludeListIsSentWhenThereIsOne() throws {
        let fields = try keys(SurpriseMeService.Params(location: nil, excluding: [UUID()]))
        XCTAssertTrue(fields.contains("p_exclude_ids"))
    }
}
