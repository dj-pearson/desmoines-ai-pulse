import XCTest
@testable import DesMoinesInsider

/// IOS-AUDIT-UX-059 AC1 -- what the user is told after a calendar write.
///
/// EventKit cannot be driven from a unit test, so what is covered is the
/// counting and the wording, which is where the defect was: stops with no
/// parseable start time were dropped by a `continue` and the summary counted
/// only what it added, so a half-timed itinerary reported an unqualified
/// success.
final class CalendarSummaryTests: XCTestCase {

    private func summary(added: Int, skipped: Int) -> String {
        ItineraryDetailView.calendarSummary(added: added, skipped: skipped)
    }

    func testEverythingAddedSaysSo() {
        XCTAssertEqual(summary(added: 3, skipped: 0), "Added 3 stops to your calendar.")
    }

    func testASingleStopIsNotPluralised() {
        XCTAssertEqual(summary(added: 1, skipped: 0), "Added 1 stop to your calendar.")
    }

    func testAPartialAddNamesWhatWasSkipped() {
        // The case the old code reported as a plain success.
        XCTAssertEqual(
            summary(added: 2, skipped: 3),
            "Added 2 stops. Skipped 3 with no start time."
        )
    }

    func testEverythingSkippedIsNotReportedAsNothingToAdd() {
        // The old message was "No timed stops to add", which reads as "your
        // itinerary is empty" rather than "none of your stops have times".
        let message = summary(added: 0, skipped: 4)
        XCTAssertEqual(message, "Couldn't add 4 stops - they have no start time.")
        XCTAssertFalse(message.contains("Added"))
    }

    func testAnEmptyItinerarySaysThatInstead() {
        // Genuinely nothing to do, which is a different thing from four stops
        // that could not be parsed - and the old code said the same for both.
        XCTAssertEqual(summary(added: 0, skipped: 0), "This itinerary has no stops to add.")
    }

    func testTheSkippedCountIsAlsoPluralised() {
        XCTAssertEqual(summary(added: 0, skipped: 1), "Couldn't add 1 stop - they have no start time.")
    }
}
