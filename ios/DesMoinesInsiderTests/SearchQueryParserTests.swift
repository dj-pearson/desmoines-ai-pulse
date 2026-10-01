import XCTest
@testable import DesMoinesInsider

/// IOS-DD-SEARCH-05: words that mean a filter become that filter, and only
/// the rest goes to text search.
final class SearchQueryParserTests: XCTestCase {

    private func parse(_ text: String) -> ParsedSearch {
        SearchQueryParser.parse(text)
    }

    func testTonightIsADateFilter() {
        let p = parse("Live music tonight")
        XCTAssertEqual(p.keywords, "Live music")
        XCTAssertEqual(p.filters.datePreset, .tonight)
    }

    func testFreeEventsIsAllFilter() {
        let p = parse("Free events")
        XCTAssertEqual(p.keywords, "")
        XCTAssertTrue(p.filters.freeOnly)
        XCTAssertEqual(p.filters.tabHint, .events)
    }

    func testDowntownRestaurants() {
        let p = parse("Downtown restaurants")
        XCTAssertEqual(p.keywords, "")
        XCTAssertEqual(p.filters.areas, [.downtown])
        XCTAssertEqual(p.filters.tabHint, .restaurants)
    }

    func testCuisineAreaAndOpenNow() {
        let p = parse("Italian restaurants in Downtown open now")
        XCTAssertEqual(p.keywords, "Italian")
        XCTAssertTrue(p.filters.openNow)
        XCTAssertEqual(p.filters.areas, [.downtown])
        XCTAssertEqual(p.filters.tabHint, .restaurants)
    }

    func testThisWeekendWinsOverWeekend() {
        let p = parse("music events this weekend")
        XCTAssertEqual(p.keywords, "music")
        XCTAssertEqual(p.filters.datePreset, .thisWeekend)
    }

    func testWholeWordsOnly() {
        let p = parse("freedom rock")
        XCTAssertEqual(p.keywords, "freedom rock")
        XCTAssertTrue(p.filters.isEmpty)
    }

    func testDesMoinesIsNoise() {
        XCTAssertEqual(parse("Des Moines jazz").keywords, "jazz")
    }

    func testWestDesMoinesIsAnArea() {
        let p = parse("brunch in West Des Moines")
        XCTAssertEqual(p.keywords, "brunch")
        XCTAssertEqual(p.filters.areas, [.westDesMoines])
    }

    func testStopWordInsideAPhraseIsKept() {
        XCTAssertEqual(parse("pizza at the Fong's").keywords, "pizza at the Fong's")
    }

    func testPunctuationAroundAFilterWord() {
        let p = parse("comedy, tonight!")
        XCTAssertEqual(p.filters.datePreset, .tonight)
        XCTAssertEqual(p.keywords, "comedy,")
    }

    func testCategoryWordsStayKeywords() {
        let p = parse("music")
        XCTAssertEqual(p.keywords, "music")
        XCTAssertNil(p.filters.category)
    }

    func testAreaSlugs() {
        XCTAssertEqual(SearchQueryParser.area(slug: "east-village"), .eastVillage)
        XCTAssertEqual(SearchQueryParser.area(slug: "des-moines"), .desMoines)
        XCTAssertNil(SearchQueryParser.area(slug: "beaverdale"))
        XCTAssertEqual(SearchQueryParser.areaSlugs.count, LocationArea.allCases.count)
    }

    func testPresetSlugsRoundTrip() {
        XCTAssertEqual(SearchQueryParser.presetSlug[.thisWeekend], "this-weekend")
        XCTAssertEqual(SearchQueryParser.preset(slug: "this-weekend"), .thisWeekend)
        XCTAssertEqual(SearchQueryParser.presetSlug[.tonight], "today")
    }

    // MARK: - Removing a chip

    func testRemovingAChipStripsItsWords() {
        XCTAssertEqual(SearchQueryParser.removing(.date(.tonight), from: "Live music tonight"), "Live music")
        XCTAssertEqual(SearchQueryParser.removing(.area(.downtown), from: "pizza in Downtown"), "pizza")
        XCTAssertEqual(
            SearchQueryParser.removing(.openNow, from: "Downtown restaurants open now"),
            "Downtown restaurants"
        )
    }

    func testFilterChipsAndRemoval() {
        let filters = SearchFilters(datePreset: .tonight, freeOnly: true, areas: [.eastVillage])
        XCTAssertEqual(filters.chips, [.date(.tonight), .free, .area(.eastVillage)])
        XCTAssertEqual(filters.removing(.free).chips, [.date(.tonight), .area(.eastVillage)])
    }

    func testExplicitFiltersWin() {
        let parsed = SearchFilters(datePreset: .tonight)
        let explicit = SearchFilters(datePreset: .thisWeekend, category: .music)
        let merged = parsed.merged(with: explicit)
        XCTAssertEqual(merged.datePreset, .thisWeekend)
        XCTAssertEqual(merged.category, .music)
    }
}
