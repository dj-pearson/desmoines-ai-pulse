import XCTest
@testable import DesMoinesInsider

/// IOS-AUDIT-FEAT-039 -- the calendar entry event detail and the Saved tab
/// both write.
///
/// EventKit cannot be driven from a unit test, so what is covered is the
/// entry the writer hands it. Before this the rules lived inline in
/// EventDetailViewModel.addToCalendar, where nothing could assert them, and a
/// second screen offering Add to Calendar would have needed its own copy.
final class EventCalendarEntryTests: XCTestCase {

    /// 18:30 in Des Moines (CDT, UTC-5) on 2026-10-01.
    private let startISO = "2026-10-01T23:30:00Z"

    private func event(start: String = "2026-10-01T23:30:00Z", end: String? = nil) -> Event {
        var e = Event(id: "e1", title: "Jazz in July", date: start)
        e.endDate = end
        e.venue = "Water Works Park"
        e.city = "Des Moines"
        e.description = "Bring a chair."
        return e
    }

    private func iso(_ text: String) -> Date {
        DateParser.parse(text)!
    }

    func testAnEventWithNoDateHasNoEntry() {
        XCTAssertNil(EventCalendarEntry(event: event(start: "")))
    }

    func testATimedEventUsesItsOwnEnd() throws {
        let entry = try XCTUnwrap(EventCalendarEntry(event: event(end: "2026-10-02T02:00:00Z")))
        XCTAssertFalse(entry.isAllDay)
        XCTAssertEqual(entry.startDate, iso(startISO))
        XCTAssertEqual(entry.endDate, iso("2026-10-02T02:00:00Z"))
    }

    func testATimedEventWithNoEndRunsThreeHours() throws {
        let entry = try XCTUnwrap(EventCalendarEntry(event: event()))
        XCTAssertEqual(entry.endDate.timeIntervalSince(entry.startDate), 3 * 3600)
    }

    func testAnEndBeforeTheStartIsIgnored() throws {
        // A bad end_date must not produce an entry EventKit rejects or one
        // that ends before it begins.
        let entry = try XCTUnwrap(EventCalendarEntry(event: event(end: "2026-10-01T20:00:00Z")))
        XCTAssertEqual(entry.endDate.timeIntervalSince(entry.startDate), 3 * 3600)
    }

    func testATimeTBAEventIsAllDayOnItsDesMoinesDay() throws {
        // The IOS-DD-EVENTS-05 rule: no fake 7:31pm block for an untimed row.
        var e = event()
        e.timeTbd = true
        let entry = try XCTUnwrap(EventCalendarEntry(event: e))
        XCTAssertTrue(entry.isAllDay)
        // Midnight Central on 2026-10-01 is 05:00 UTC.
        XCTAssertEqual(entry.startDate, iso("2026-10-01T05:00:00Z"))
    }

    func testTheEntryIsPinnedToDesMoinesTime() throws {
        let entry = try XCTUnwrap(EventCalendarEntry(event: event()))
        XCTAssertEqual(entry.timeZone.identifier, "America/Chicago")
    }

    func testTitleLocationAndNotesComeFromTheEvent() throws {
        let entry = try XCTUnwrap(EventCalendarEntry(event: event()))
        XCTAssertEqual(entry.title, "Jazz in July")
        XCTAssertEqual(entry.location, "Water Works Park, Des Moines")
        XCTAssertEqual(entry.notes, "Bring a chair.")
    }

    // MARK: - Result wording

    func testADenialIsWordedAsEventDetailWordsIt() {
        // The Saved tab shows this same string, so both screens point at
        // Settings in the same words.
        XCTAssertEqual(
            CalendarAddResult.denied.errorMessage,
            "Calendar access was denied. You can enable it in Settings."
        )
    }

    func testOnlyADenialOffersSettings() {
        XCTAssertTrue(CalendarAddResult.denied.offersSettings)
        XCTAssertFalse(CalendarAddResult.added.offersSettings)
        XCTAssertFalse(CalendarAddResult.noDate.offersSettings)
        XCTAssertFalse(CalendarAddResult.failed("disk full").offersSettings)
    }

    func testSuccessHasNoErrorMessage() {
        XCTAssertNil(CalendarAddResult.added.errorMessage)
        XCTAssertEqual(CalendarAddResult.failed("disk full").errorMessage, "disk full")
        XCTAssertEqual(CalendarAddResult.noDate.errorMessage, "Event date is not available.")
    }
}
