import XCTest
@testable import DesMoinesInsider

/// IOS-DD-EVENTS-05: time-TBA rows and Des Moines day boundaries.
final class EventTimeTests: XCTestCase {

    private func event(date: String, timeTbd: Bool? = nil, source: String? = nil, eventStartLocal: String? = nil) -> Event {
        var e = Event(id: "e1", title: "Show", date: date)
        e.timeTbd = timeTbd
        e.source = source
        e.eventStartLocal = eventStartLocal
        return e
    }

    func testExplicitTimeTbdHasNoSpecificTime() {
        XCTAssertFalse(event(date: "2026-10-05T00:00:00Z", timeTbd: true).hasSpecificTime)
    }

    func testTheNoTimeMarkerHasNoSpecificTime() {
        // 00:31:58Z on Oct 4 is 19:31:58 CDT on Oct 3.
        XCTAssertFalse(event(date: "2026-10-04T00:31:58Z").hasSpecificTime)
    }

    func testTheMarkerInEventStartLocalHasNoSpecificTime() {
        XCTAssertFalse(event(date: "2026-10-04T00:31:58Z", eventStartLocal: "2026-10-03T19:31:58").hasSpecificTime)
    }

    func testSeatGeekPlaceholderHasNoSpecificTime() {
        // 08:30Z is 03:30 CDT.
        XCTAssertFalse(event(date: "2026-10-04T08:30:00Z", source: "seatgeek").hasSpecificTime)
    }

    func testARealTimeIsSpecific() {
        // 00:00Z on Oct 5 is 19:00 CDT on Oct 4.
        XCTAssertTrue(event(date: "2026-10-05T00:00:00Z").hasSpecificTime)
    }

    func testTodayIsTodayInDesMoines() {
        // now: 2026-09-27 15:00Z (10:00 CDT). Event: 23:30 CDT the same day,
        // which is 04:30Z on the 28th - "tomorrow" on a UTC clock.
        let now = Date(timeIntervalSince1970: 1_790_521_200)
        let e = event(date: "2026-09-28T04:30:00Z")
        XCTAssertEqual(e.urgency(at: now, calendar: DesMoinesTime.calendar), "Today")
    }

    func testHappeningNowWithinThreeHoursOfStart() {
        let e = event(date: "2026-09-27T14:00:00Z")
        let now = Date(timeIntervalSince1970: 1_790_521_200) // 15:00Z
        XCTAssertTrue(e.happeningNow(at: now))
        XCTAssertEqual(e.urgency(at: now), "Happening now")
    }

    func testAMultiDayRunIsHappeningUntilItsEnd() {
        var e = event(date: "2026-09-25T15:00:00Z")
        e.endDate = "2026-09-28T02:00:00Z"
        let now = Date(timeIntervalSince1970: 1_790_521_200) // 2026-09-27 15:00Z
        XCTAssertTrue(e.happeningNow(at: now))
    }
}
