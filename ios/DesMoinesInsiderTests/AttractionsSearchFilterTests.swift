import XCTest
@testable import DesMoinesInsider

/// IOS-DD-SEARCH-01: the attractions search text is escaped into four quoted
/// ilike branches, never interpolated raw into the or= filter.
final class AttractionsSearchFilterTests: XCTestCase {

    private func expected(_ text: String) -> String {
        let p = EventsService.ilikeContains(text)
        return "name.ilike.\(p),type.ilike.\(p),location.ilike.\(p),description.ilike.\(p)"
    }

    func testPunctuationAndWildcardsAreEscaped() {
        let input = "a,b)(c%_"
        XCTAssertEqual(AttractionsService.searchOrFilter(input), expected(input))
        // The escaping itself is asserted once, by ilikeContains.
        XCTAssertEqual(EventsService.ilikeContains(input), "\"%a,b)(c\\\\%\\\\_%\"")
    }

    func testInjectedBranchStaysInsideQuotes() {
        let input = "x%,rating.gte.0"
        let filter = AttractionsService.searchOrFilter(input)
        XCTAssertEqual(filter, expected(input))
        // Four top-level branches: split on the commas that sit outside quotes.
        var depthInQuotes = false
        var previous: Character?
        var topLevelCommas = 0
        for ch in filter ?? "" {
            if ch == "\"" && previous != "\\" { depthInQuotes.toggle() }
            if ch == "," && !depthInQuotes { topLevelCommas += 1 }
            previous = ch
        }
        XCTAssertEqual(topLevelCommas, 3)
    }

    func testWhitespaceIsNil() {
        XCTAssertNil(AttractionsService.searchOrFilter("   "))
        XCTAssertNil(AttractionsService.searchOrFilter("\n\t"))
    }

    func testLongInputIsCappedAt100() {
        let input = String(repeating: "z", count: 150)
        XCTAssertEqual(
            AttractionsService.searchOrFilter(input),
            expected(String(repeating: "z", count: 100))
        )
    }

    func testTrimsBeforeBuilding() {
        XCTAssertEqual(AttractionsService.searchOrFilter("  zoo "), expected("zoo"))
    }
}
