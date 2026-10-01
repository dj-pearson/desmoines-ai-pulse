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

    /// IOS-AUDIT-FEAT-024: only Events-tab saves map to the top-level
    /// `search_type = 'event_list'` the nightly alert job scans; every other tab
    /// stays 'advanced' so it isn't (incorrectly) picked up by the event pipeline.
    func testSearchTypeMappingForAlertEligibility() {
        XCTAssertEqual(SavedSearchService.searchType(for: "Events"), "event_list")
        XCTAssertEqual(SavedSearchService.searchType(for: "Restaurants"), "advanced")
        XCTAssertEqual(SavedSearchService.searchType(for: "Attractions"), "advanced")
        XCTAssertEqual(SavedSearchService.searchType(for: nil), "advanced")
    }

    // MARK: - Web rows (IOS-DD-SEARCH-09)

    private let webRow = """
    {
      "id": "w1", "user_id": "u1", "name": "Weekend jazz",
      "search_type": "event_list", "alerts_enabled": true,
      "filters": { "q": "jazz", "category": "Music", "preset": "this-weekend",
                   "location": "east-village", "price": "free", "sort": "date" }
    }
    """

    private func decode(_ json: String) throws -> SavedSearch {
        try JSONDecoder().decode(SavedSearch.self, from: Data(json.utf8))
    }

    func testWebEventListRowDecodes() throws {
        let search = try decode(webRow)
        XCTAssertEqual(search.query, "jazz")
        XCTAssertTrue(search.alertsEnabled)
        XCTAssertTrue(search.isAlertEligible)
        XCTAssertEqual(
            search.structuredFilters,
            SearchFilters(datePreset: .thisWeekend, freeOnly: true, areas: [.eastVillage], category: .music)
        )
    }

    func testMergedFiltersPreserveWebKeys() throws {
        let search = try decode(webRow)
        let merged = search.mergedFilters(alertsEnabled: false)
        for (key, value) in search.rawFilters where key != "alerts_enabled" {
            XCTAssertEqual(merged[key], value, key)
        }
        XCTAssertEqual(merged["alerts_enabled"], .bool(false))
        XCTAssertEqual(merged["sort"], .string("date"), "a key iOS does not model is kept")
        // And it encodes back to the same keys.
        let data = try JSONEncoder().encode(merged)
        let round = try JSONDecoder().decode([String: SavedSearchJSON].self, from: data)
        XCTAssertEqual(round, merged)
    }

    func testTopLevelAlertsWins() throws {
        let search = try decode("""
        { "id": "s3", "user_id": "u1", "name": "x", "search_type": "event_list",
          "alerts_enabled": true, "filters": { "query": "x", "alerts_enabled": false } }
        """)
        XCTAssertTrue(search.alertsEnabled)
    }

    func testAdvancedRowIgnoresTheColumnDefault() throws {
        // alerts_enabled is NOT NULL DEFAULT true, so an old iOS row reads true
        // there while its own flag says false; the job never reads it.
        let search = try decode("""
        { "id": "s4", "user_id": "u1", "name": "x", "search_type": "advanced",
          "alerts_enabled": true, "filters": { "query": "x", "tab": "Restaurants", "alerts_enabled": false } }
        """)
        XCTAssertFalse(search.alertsEnabled)
        XCTAssertFalse(search.isAlertEligible)
        XCTAssertFalse(search.promotesToEventList)
    }

    func testOldIOSEventsRowCanBePromoted() throws {
        let search = try decode("""
        { "id": "s5", "user_id": "u1", "name": "x", "search_type": "advanced",
          "filters": { "query": "x", "tab": "Events" } }
        """)
        XCTAssertTrue(search.promotesToEventList)
    }

    func testEncodeAddsStructuredKeys() throws {
        let filters = SavedSearchFilters(query: "jazz this weekend", tab: "Events", q: "jazz", preset: "this-weekend")
        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(filters)) as? [String: Any]
        )
        XCTAssertEqual(json["query"] as? String, "jazz this weekend")
        XCTAssertEqual(json["q"] as? String, "jazz")
        XCTAssertEqual(json["preset"] as? String, "this-weekend")
        XCTAssertNil(json["price"], "unset keys are left out")
    }

    func testForSaveWritesTheWebKeys() {
        let parsed = SearchQueryParser.parse("free jazz this weekend in East Village")
        let filters = SavedSearchFilters.forSave(query: "free jazz this weekend in East Village", tab: "Events", parsed: parsed)
        XCTAssertEqual(filters.q, "jazz")
        XCTAssertEqual(filters.preset, "this-weekend")
        XCTAssertEqual(filters.price, "free")
        XCTAssertEqual(filters.location, "east-village")
        XCTAssertNil(filters.category)
    }

    func testTonightSavedAsTodayReRunsAsTonight() throws {
        let search = try decode("""
        { "id": "t1", "user_id": "u1", "name": "x", "search_type": "event_list",
          "filters": { "query": "Live music tonight", "q": "Live music", "preset": "today" } }
        """)
        XCTAssertEqual(search.structuredFilters.datePreset, .tonight)
    }

    func testTodayPresetStaysToday() throws {
        let search = try decode("""
        { "id": "t2", "user_id": "u1", "name": "x", "filters": { "q": "jazz", "preset": "today" } }
        """)
        XCTAssertEqual(search.structuredFilters.datePreset, .today)
    }

    // MARK: - Alert eligibility (IOS-DD-SEARCH-10)

    func testSearchTypeUsesEventResults() {
        XCTAssertEqual(SavedSearchService.searchType(tab: "Restaurants", hadEventResults: true), "event_list")
        XCTAssertEqual(SavedSearchService.searchType(tab: "Restaurants", hadEventResults: false), "advanced")
        XCTAssertEqual(SavedSearchService.searchType(tab: "Events", hadEventResults: false), "event_list")
    }

    @MainActor
    func testAlertCountIgnoresIneligibleRows() throws {
        let eligible = try decode("""
        { "id": "a", "user_id": "u1", "name": "a", "search_type": "event_list", "alerts_enabled": true, "filters": {} }
        """)
        let ineligible = try decode("""
        { "id": "b", "user_id": "u1", "name": "b", "search_type": "advanced", "alerts_enabled": true,
          "filters": { "alerts_enabled": true } }
        """)
        XCTAssertEqual(SavedSearchesViewModel.alertCount([eligible, ineligible]), 1)
    }
}
