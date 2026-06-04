import XCTest
@testable import DesMoinesInsider

/// Pure-logic coverage for IOS-PARITY-008. The networked CRUD + gating run in
/// CI; these lock the saved_searches decode contract (incl. the nested filters
/// JSON) and the tolerant filters decoding.
final class SavedSearchTests: XCTestCase {

    func testSavedSearchDecodesWithNestedFilters() throws {
        let json = """
        {
          "id": "s1", "user_id": "u1", "name": "Free weekend",
          "filters": { "query": "free weekend", "tab": "Events", "alerts_enabled": true },
          "use_count": 3, "created_at": "2026-05-01T12:00:00Z",
          "updated_at": "2026-05-02T12:00:00Z"
        }
        """.data(using: .utf8)!
        let search = try JSONDecoder().decode(SavedSearch.self, from: json)
        XCTAssertEqual(search.name, "Free weekend")
        XCTAssertEqual(search.query, "free weekend")
        XCTAssertTrue(search.alertsEnabled)
        XCTAssertEqual(search.filters.tab, "Events")
    }

    func testFiltersDecodeToleratesMissingFields() throws {
        // A foreign/older row whose filters JSON lacks our keys must still decode.
        let json = """
        { "id": "s2", "user_id": "u1", "name": "Legacy", "filters": {} }
        """.data(using: .utf8)!
        let search = try JSONDecoder().decode(SavedSearch.self, from: json)
        XCTAssertEqual(search.query, "")
        XCTAssertFalse(search.alertsEnabled)
        XCTAssertNil(search.filters.tab)
    }

    func testFiltersRoundTripEncodeDecode() throws {
        let filters = SavedSearchFilters(query: "live music", tab: "Events", alertsEnabled: true)
        let data = try JSONEncoder().encode(filters)
        let decoded = try JSONDecoder().decode(SavedSearchFilters.self, from: data)
        XCTAssertEqual(decoded.query, "live music")
        XCTAssertEqual(decoded.tab, "Events")
        XCTAssertTrue(decoded.alertsEnabled)
        // Encodes with the snake_case key the column expects.
        let str = String(data: data, encoding: .utf8)!
        XCTAssertTrue(str.contains("alerts_enabled"))
    }
}
