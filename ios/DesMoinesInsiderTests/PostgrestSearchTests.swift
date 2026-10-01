import XCTest
@testable import DesMoinesInsider

/// The multi-column search Hotels and Articles send in PostgREST `or=`
/// (IOS-DD-GUIDES-16). Each clause must carry the query quoted and escaped,
/// so punctuation cannot split the logic tree and `%`/`_` are literal.
final class PostgrestSearchTests: XCTestCase {

    private let columns = ["name", "description", "area", "chain_name"]

    func testCommaAndParensAreQuoted() throws {
        let filter = try XCTUnwrap(PostgrestSearch.searchOrFilter(columns: columns, query: "Hilton, downtown (West)"))
        let expectedClause = EventsService.ilikeContains("Hilton, downtown (West)")
        XCTAssertTrue(expectedClause.hasPrefix("\""), "the value is double-quoted")
        let clauses = columns.map { "\($0).ilike.\(expectedClause)" }
        XCTAssertEqual(filter, clauses.joined(separator: ","))
        XCTAssertEqual(clauses.count, 4)
        for (column, clause) in zip(columns, clauses) {
            XCTAssertTrue(clause.hasPrefix("\(column).ilike.\""))
            XCTAssertTrue(filter.contains(clause))
        }
    }

    func testWildcardsAreEscaped() throws {
        let filter = try XCTUnwrap(PostgrestSearch.searchOrFilter(columns: ["title"], query: "50%_off"))
        XCTAssertTrue(filter.contains("50\\\\%\\\\_off"), filter)
    }

    func testBlankReturnsNil() {
        XCTAssertNil(PostgrestSearch.searchOrFilter(columns: columns, query: "   "))
        XCTAssertNil(PostgrestSearch.searchOrFilter(columns: columns, query: "**"))
        XCTAssertNil(PostgrestSearch.searchOrFilter(columns: [], query: "hilton"))
    }

    func testCapsAt100() throws {
        let long = String(repeating: "a", count: 250)
        let filter = try XCTUnwrap(PostgrestSearch.searchOrFilter(columns: ["title"], query: long))
        XCTAssertEqual(filter, "title.ilike.\"%" + String(repeating: "a", count: 100) + "%\"")
    }
}
