import XCTest
@testable import DesMoinesInsider

/// Custom day ranges in Search (IOS-AUDIT-003): the web hub's `?from=&to=`
/// and the monthly archive, with day boundaries in Central time.
final class EventDayRangeTests: XCTestCase {

    private func utc(_ iso: String) -> Date {
        ISO8601DateFormatter().date(from: iso)!
    }

    // MARK: - ?from=&to= (resolveHubDate's rules)

    func testFromAndToAreReadAsInclusiveDays() {
        let range = EventDayRange(from: "2026-06-05", to: "2026-06-09")
        XCTAssertEqual(range?.first, "2026-06-05")
        XCTAssertEqual(range?.last, "2026-06-09")
        XCTAssertEqual(range?.label, "Jun 5 - Jun 9")
    }

    func testFromAloneOrWithABadToIsOneDay() {
        XCTAssertEqual(EventDayRange(from: "2026-06-05", to: nil)?.last, "2026-06-05")
        XCTAssertEqual(EventDayRange(from: "2026-06-05", to: "soon")?.last, "2026-06-05")
        XCTAssertEqual(EventDayRange(from: "2026-06-05", to: "2026-06-05")?.label, "Jun 5")
    }

    func testAnInvertedRangeIsReadTheRightWayRound() {
        let range = EventDayRange(from: "2026-06-09", to: "2026-06-05")
        XCTAssertEqual(range?.first, "2026-06-05")
        XCTAssertEqual(range?.last, "2026-06-09")
    }

    func testNoValidFromIsNoRange() {
        XCTAssertNil(EventDayRange(from: nil, to: "2026-06-09"))
        XCTAssertNil(EventDayRange(from: "2026-6-5", to: nil))
        XCTAssertNil(EventDayRange(from: "2026-02-30", to: nil))
        XCTAssertNil(EventDayRange(from: "2026-13-01", to: nil))
        XCTAssertNil(EventDayRange(from: "tomorrow", to: nil))
    }

    // MARK: - Month pages

    func testMonthSlugCoversTheWholeMonth() {
        let june = EventDayRange(monthSlug: "june-2026")
        XCTAssertEqual(june?.first, "2026-06-01")
        XCTAssertEqual(june?.last, "2026-06-30")
        XCTAssertEqual(june?.label, "June 2026")
        XCTAssertEqual(EventDayRange(monthSlug: "february-2028")?.last, "2028-02-29", "leap year")
        XCTAssertEqual(EventDayRange(monthSlug: "february-2027")?.last, "2027-02-28")
    }

    func testOnlyTheMonthPageShapeIsAMonth() {
        XCTAssertNil(EventDayRange(monthSlug: "June-2026"))
        XCTAssertNil(EventDayRange(monthSlug: "smarch-2026"))
        XCTAssertNil(EventDayRange(monthSlug: "june-26"))
        XCTAssertNil(EventDayRange(monthSlug: "june-2026-concert"))
    }

    // MARK: - Central-time boundaries

    func testMonthWindowRunsMidnightToMidnightCentral() throws {
        // June is CDT (UTC-5) throughout.
        let window = try XCTUnwrap(EventDayRange(monthSlug: "june-2026")?.window())
        XCTAssertEqual(window.start, utc("2026-06-01T05:00:00Z"))
        XCTAssertEqual(window.end, utc("2026-07-01T05:00:00Z"))
    }

    func testMonthWindowFollowsTheClockChange() throws {
        // November starts on CDT (UTC-5) and ends on CST (UTC-6).
        let window = try XCTUnwrap(EventDayRange(monthSlug: "november-2026")?.window())
        XCTAssertEqual(window.start, utc("2026-11-01T05:00:00Z"))
        XCTAssertEqual(window.end, utc("2026-12-01T06:00:00Z"))
    }

    func testTheWindowIgnoresThePhonesTimeZone() throws {
        var tokyo = Calendar(identifier: .gregorian)
        tokyo.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        let range = try XCTUnwrap(EventDayRange(from: "2026-06-05", to: nil))
        // The default is Des Moines, whatever the device is set to.
        let window = try XCTUnwrap(range.window())
        XCTAssertEqual(window.start, utc("2026-06-05T05:00:00Z"))
        XCTAssertEqual(window.end, utc("2026-06-06T05:00:00Z"))
        XCTAssertNotEqual(range.window(calendar: tokyo)?.start, window.start)
    }

    func testAMonthEndsAtMidnightCentralAfterItsLastDay() throws {
        let june = try XCTUnwrap(EventDayRange(monthSlug: "june-2026"))
        XCTAssertFalse(june.hasEnded(now: utc("2026-07-01T04:59:59Z")), "11:59pm June 30 in Des Moines")
        XCTAssertTrue(june.hasEnded(now: utc("2026-07-01T05:00:00Z")))
        XCTAssertFalse(june.hasEnded(now: utc("2026-05-15T12:00:00Z")))
    }

    // MARK: - SearchFilters

    func testHubKeysSetARangeWhenThereIsNoKnownPreset() {
        let filters = SearchFilters(webEventKeys: ["from": "2026-06-01", "to": "2026-06-30"], query: "")
        XCTAssertEqual(filters.dayRange, EventDayRange(from: "2026-06-01", to: "2026-06-30"))
        XCTAssertNil(filters.datePreset)
        XCTAssertFalse(filters.isEmpty)
        XCTAssertEqual(filters.chips, [.days(EventDayRange(from: "2026-06-01", to: "2026-06-30")!)])

        // A known preset wins, as in resolveHubDate; an unknown one does not.
        let preset = SearchFilters(webEventKeys: ["preset": "today", "from": "2026-06-01"], query: "")
        XCTAssertEqual(preset.datePreset, .today)
        XCTAssertNil(preset.dayRange)
        let unknown = SearchFilters(webEventKeys: ["preset": "someday", "from": "2026-06-01"], query: "")
        XCTAssertEqual(unknown.dayRange?.first, "2026-06-01")
    }

    func testAPresetAndARangeReplaceEachOther() {
        var range = SearchFilters()
        range.dayRange = EventDayRange(monthSlug: "june-2026")
        let tonight = SearchFilters(datePreset: .tonight)

        let rangeOverTonight = tonight.merged(with: range)
        XCTAssertNil(rangeOverTonight.datePreset)
        XCTAssertEqual(rangeOverTonight.dayRange, range.dayRange)

        let tonightOverRange = range.merged(with: tonight)
        XCTAssertEqual(tonightOverRange.datePreset, .tonight)
        XCTAssertNil(tonightOverRange.dayRange)
    }

    func testTheRangeChipRemovesTheRange() throws {
        var filters = SearchFilters(freeOnly: true)
        filters.dayRange = EventDayRange(monthSlug: "june-2026")
        let chip = try XCTUnwrap(filters.chips.first { if case .days = $0 { return true } else { return false } })
        XCTAssertEqual(chip.label, "June 2026")
        XCTAssertEqual(filters.removing(chip), SearchFilters(freeOnly: true))
    }

    @MainActor
    func testARangeAloneDoesNotSearchRestaurants() {
        var filters = SearchFilters()
        filters.dayRange = EventDayRange(monthSlug: "june-2026")
        XCTAssertFalse(SearchViewModel.searchesRestaurants(ParsedSearch(keywords: "", filters: filters)))
        XCTAssertTrue(SearchViewModel.searchesRestaurants(ParsedSearch(keywords: "tacos", filters: filters)))
    }
}
