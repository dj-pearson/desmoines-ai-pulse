import XCTest
@testable import DesMoinesInsider

/// IOS-DD-BROWSE-04 / 06: how the weekend's rows are bucketed, and the pure
/// rules behind the guide's sections. The weekend used here is Fri 2026-10-02
/// to Sun 2026-10-04, Central.
final class WeekendGuideTests: XCTestCase {

    private func ct(_ month: Int, _ day: Int, _ hour: Int = 0, _ minute: Int = 0, _ second: Int = 0) -> Date {
        DesMoinesTime.calendar.date(from: DateComponents(year: 2026, month: month, day: day, hour: hour, minute: minute, second: second))!
    }

    private func iso(_ date: Date) -> String { DateParser.toISO(date) }

    private func event(_ id: String, start: Date, end: Date? = nil) -> Event {
        var e = Event(id: id, title: "Event \(id)", date: iso(start))
        e.endDate = end.map(iso)
        return e
    }

    private var window: WeekendWindow { WeekendWindow.current(now: ct(9, 30, 12)) }

    // MARK: Bucketing

    func testThursdayStartRunningToSundayGoesToAllWeekend() {
        let festival = event("fest", start: ct(10, 1, 10), end: ct(10, 4, 18))
        let result = WeekendGuide.bucket([festival], window: window)
        XCTAssertEqual(result.allWeekend.map(\.id), ["fest"])
        XCTAssertTrue(result.byDay.isEmpty)
    }

    func testEarlierRunThatEndedBeforeFridayIsDropped() {
        let over = event("over", start: ct(9, 28, 10), end: ct(10, 1, 18))
        let result = WeekendGuide.bucket([over], window: window)
        XCTAssertTrue(result.allWeekend.isEmpty)
        XCTAssertTrue(result.byDay.isEmpty)
    }

    func testUntimedFridayEveningRowGoesToFriday() {
        // 19:31:58 CT is the ingest's no-time marker: 00:31:58Z on Saturday.
        let row = event("fri", start: ct(10, 2, 19, 31, 58))
        XCTAssertEqual(WeekendGuide.bucket([row], window: window).byDay[.friday]?.map(\.id), ["fri"])
    }

    func testMondayEarlyRowIsDropped() {
        let row = event("mon", start: ct(10, 5, 0, 30))
        let result = WeekendGuide.bucket([row], window: window)
        XCTAssertTrue(result.byDay.isEmpty)
        XCTAssertTrue(result.allWeekend.isEmpty)
    }

    func testOverlapFilterCoversStartAndEnd() {
        let filter = EventsService.weekendOverlapFilter(window)
        let friday = DateParser.toISO(window.fridayStart)
        XCTAssertTrue(filter.contains("date.gte.\(friday)"))
        XCTAssertTrue(filter.contains("end_date.gte.\(friday)"))
    }

    // MARK: Picks

    func testPicksOrderFeaturedThenWriteupThenPlainAndSkipOver() {
        let now = ct(10, 3, 12)
        var plain = event("plain", start: ct(10, 3, 14))
        plain.price = "$10"
        var writeup = event("writeup", start: ct(10, 4, 14))
        writeup.aiWriteup = "Worth it."
        var featured = event("featured", start: ct(10, 4, 20))
        featured.isFeatured = true
        var finished = event("finished", start: ct(10, 2, 18), end: ct(10, 2, 21))
        finished.isFeatured = true

        let picks = WeekendGuide.picks([plain, writeup, featured, finished], now: now)
        XCTAssertEqual(picks.map(\.id), ["featured", "writeup", "plain"])
    }

    // MARK: Free

    func testFreeNeedsAListedFreePrice() {
        let now = ct(10, 2, 9)
        var none = event("none", start: ct(10, 3, 12))
        none.price = nil
        var zero = event("zero", start: ct(10, 3, 12))
        zero.price = "$0"
        var word = event("word", start: ct(10, 3, 13))
        word.price = "Free"
        var paid = event("paid", start: ct(10, 3, 14))
        paid.price = "$25"

        XCTAssertEqual(WeekendGuide.free([none, zero, word, paid], now: now).map(\.id), ["zero", "word"])
    }

    // MARK: Day order

    func testSaturdayAfternoonFoldsFriday() {
        let order = WeekendGuide.orderedDays(window: window, now: ct(10, 3, 14))
        XCTAssertEqual(order.upcoming, [.saturday, .sunday])
        XCTAssertEqual(order.past, [.friday])
    }

    func testMidweekAllDaysAreUpcoming() {
        let order = WeekendGuide.orderedDays(window: window, now: ct(9, 30, 14))
        XCTAssertEqual(order.upcoming, [.friday, .saturday, .sunday])
        XCTAssertTrue(order.past.isEmpty)
    }

    func testSortForTodayMovesOverRowsLast() {
        let now = ct(10, 3, 20)
        let early = event("early", start: ct(10, 3, 10), end: ct(10, 3, 12))
        let late = event("late", start: ct(10, 3, 21))
        XCTAssertEqual(WeekendGuide.sortForToday([early, late], now: now).map(\.id), ["late", "early"])
    }

    // MARK: Header count

    func testCountLinePluralisesAndMarksTruncation() {
        XCTAssertTrue(WeekendView.countLine(1, truncated: false).hasPrefix("1 event "))
        XCTAssertTrue(WeekendView.countLine(3, truncated: false).hasPrefix("3 events "))
        XCTAssertTrue(WeekendView.countLine(250, truncated: true).hasPrefix("250+ events "))
    }
}
