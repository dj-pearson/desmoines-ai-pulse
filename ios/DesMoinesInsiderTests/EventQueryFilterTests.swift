import XCTest
@testable import DesMoinesInsider

/// IOS-DD-EVENTS-02: the "not over" rule and the or-group nesting, as the web
/// builds them (src/components/events/eventsHubQuery.ts).
final class EventQueryFilterTests: XCTestCase {

    func testCombineOrGroupsEmptyIsNil() {
        XCTAssertNil(EventsService.combineOrGroups([]))
    }

    func testCombineOrGroupsOneGroupIsUnwrapped() {
        XCTAssertEqual(EventsService.combineOrGroups(["a.eq.1"]), "a.eq.1")
    }

    func testCombineOrGroupsNestsSeveral() {
        XCTAssertEqual(EventsService.combineOrGroups(["a.eq.1", "b.eq.2"]), "and(or(a.eq.1),or(b.eq.2))")
    }

    func testNotOverFilterHasAllThreeArms() {
        // 2026-09-27 15:00:00Z = 10:00 CDT.
        let now = Date(timeIntervalSince1970: 1_790_521_200)
        let filter = EventsService.notOverFilter(now: now)
        // Started in the last two hours.
        XCTAssertTrue(filter.contains("date.gte.2026-09-27T13:00:00Z"), filter)
        // A run still going.
        XCTAssertTrue(filter.contains("end_date.gte.2026-09-27T15:00:00Z"), filter)
        // Today's untimed marker: 19:31:58 CDT = 00:31:58Z the next UTC day.
        XCTAssertTrue(filter.contains("date.eq.2026-09-28T00:31:58Z"), filter)
    }

    func testUntimedMarkerUsesTheCentralDateNotTheUTCDate() {
        // 2026-09-28 03:00:00Z is still 22:00 on the 27th in Des Moines.
        let lateEvening = Date(timeIntervalSince1970: 1_790_564_400)
        XCTAssertEqual(
            DateParser.toISO(EventsService.untimedMarkerToday(now: lateEvening)),
            "2026-09-28T00:31:58Z"
        )
    }

    func testFreePriceFilterIsTheWebString() {
        // src/lib/eventPrice.ts FREE_PRICE_FILTER, byte for byte.
        XCTAssertEqual(
            EventsService.freePriceFilter,
            "and(price.ilike.%free%,price.not.match.[$] *[1-9]),price.eq.$0,price.eq.0"
        )
    }
}

/// IOS-DD-EVENTS-22: a view is counted once per session.
final class EventViewRecordingTests: XCTestCase {
    func testEachEventIsRecordedOncePerSession() async {
        let service = EventsService()
        let first = await service.shouldRecord("e1")
        let second = await service.shouldRecord("e1")
        let other = await service.shouldRecord("e2")
        XCTAssertTrue(first)
        XCTAssertFalse(second)
        XCTAssertTrue(other)
    }
}
