import XCTest
@testable import DesMoinesInsider

/// IOS-AUDIT-008: /events/date-night is a native Search on Events with the
/// web page's rule (src/pages/DateNightEvents.tsx): DATE_NIGHT_FILTER over a
/// two-week Central window, evening starts unless `?time=all`.
final class DateNightSearchTests: XCTestCase {

    private func filters(_ times: DateNightTimes) -> SearchFilters {
        var f = SearchFilters(tabHint: .events)
        f.dateNight = times
        return f
    }

    private func event(_ id: String = "e", _ date: String, utc: String? = nil, tbd: Bool? = nil) -> Event {
        var e = Event(id: id, title: "Show", date: date)
        e.eventStartUtc = utc
        e.timeTbd = tbd
        return e
    }

    private func instant(_ iso: String) -> Date? {
        ISO8601DateFormatter().date(from: iso)
    }

    // MARK: - The filter

    func testFilterIsTheWebString() {
        // src/hooks/useEventLanding.ts DATE_NIGHT_FILTER, byte for byte
        // (iosDateNightParity.test.ts guards the source too).
        XCTAssertEqual(
            EventsService.dateNightEventsFilter,
            #"category.in.(Music,Comedy,Arts),"#
                + #"title.imatch."[[:<:]](concerts?|live music|wine|dinner|comedy|jazz|tasting)[[:>:]]""#
        )
        // Its own or-group: the commas inside in.() and the quoted pattern
        // stay inside it.
        XCTAssertEqual(
            EventsService.combineOrGroups(["a.eq.1", EventsService.dateNightEventsFilter])?
                .hasPrefix("and(or(a.eq.1),or(category.in.(Music,Comedy,Arts),title.imatch."),
            true
        )
    }

    // MARK: - The window

    func testWindowIsTodayPlusThirteenDaysInCentral() throws {
        // Noon CST on Nov 15 -> midnight CST Nov 15 to midnight CST Nov 29.
        let now = try XCTUnwrap(instant("2026-11-15T18:00:00Z"))
        let window = EventsService.dateNightWindow(now: now)
        XCTAssertEqual(window?.start, instant("2026-11-15T06:00:00Z"))
        XCTAssertEqual(window?.end, instant("2026-11-29T06:00:00Z"))
    }

    func testWindowEndsAtCentralMidnightAcrossTheSpringChange() throws {
        // DST starts Mar 8 2026, so the closing midnight is CDT (UTC-5).
        let now = try XCTUnwrap(instant("2026-03-01T18:00:00Z"))
        let window = EventsService.dateNightWindow(now: now)
        XCTAssertEqual(window?.start, instant("2026-03-01T06:00:00Z"))
        XCTAssertEqual(window?.end, instant("2026-03-15T05:00:00Z"))
    }

    // MARK: - Evening starts

    func testEveningIsFourPMToBeforeFourAMCentral() {
        XCTAssertTrue(event("2026-11-21T01:30:00Z").startsInTheEvening)   // 7:30 PM
        XCTAssertTrue(event("2026-11-20T22:00:00Z").startsInTheEvening)   // 4:00 PM
        XCTAssertFalse(event("2026-11-20T21:59:00Z").startsInTheEvening)  // 3:59 PM
        XCTAssertTrue(event("2026-11-21T08:00:00Z").startsInTheEvening)   // 2:00 AM
        XCTAssertFalse(event("2026-11-21T10:00:00Z").startsInTheEvening)  // 4:00 AM
        XCTAssertFalse(event("2026-11-21T16:00:00Z").startsInTheEvening)  // 10:00 AM
    }

    func testNoSpecificTimeIsNotEvening() {
        XCTAssertFalse(event("2026-11-21T01:30:00Z", tbd: true).startsInTheEvening)
        // 19:31:58 Central, the ingest no-time marker.
        XCTAssertFalse(event("2026-11-21T01:31:58Z").startsInTheEvening)
    }

    func testStartUtcWinsOverDate() {
        // The web's eventStartInstant reads event_start_utc first.
        XCTAssertTrue(event("2026-11-21T16:00:00Z", utc: "2026-11-21T01:30:00Z").startsInTheEvening)
    }

    @MainActor
    func testEveningRowsKeepOrderAndDropDaytime() {
        let early = event("early", "2026-11-21T00:00:00Z")    // 6 PM
        let matinee = event("matinee", "2026-11-21T19:00:00Z") // 1 PM
        let late = event("late", "2026-11-22T02:00:00Z")       // 8 PM
        XCTAssertEqual(SearchViewModel.eveningRows([early, matinee, late]).map(\.id), ["early", "late"])
    }

    // MARK: - Search filters

    func testChipLabelsAndRemoval() {
        XCTAssertFalse(filters(.evening).isEmpty)
        XCTAssertEqual(filters(.evening).chips, [.dateNight(.evening)])
        XCTAssertEqual(SearchFilterChip.dateNight(.evening).label, "Date night, evenings")
        XCTAssertEqual(SearchFilterChip.dateNight(.anyTime).label, "Date night")
        let cleared = filters(.evening).removing(.dateNight(.evening))
        XCTAssertNil(cleared.dateNight)
        XCTAssertTrue(cleared.isEmpty)
    }

    func testMergeKeepsDateNightFromTheLink() {
        let typed = SearchQueryParser.parse("jazz tonight").filters
        let merged = typed.merged(with: filters(.anyTime))
        XCTAssertEqual(merged.dateNight, .anyTime)
        XCTAssertEqual(merged.datePreset, .tonight)
    }

    @MainActor
    func testDateNightAloneDoesNotSearchRestaurants() {
        XCTAssertFalse(SearchViewModel.searchesRestaurants(ParsedSearch(keywords: "", filters: filters(.evening))))
    }
}
