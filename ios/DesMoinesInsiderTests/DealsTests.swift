import XCTest
@testable import DesMoinesInsider

/// Pure-logic coverage for IOS-PARITY-010. The networked fetch + SwiftUI screen
/// run in CI; these lock the decode contract and the recurring-schedule + active-
/// now rendering (DEAL-RECURRING-001).
final class DealsTests: XCTestCase {

    private var calendar: Calendar {
        var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "UTC")!; return c
    }
    private func date(_ y: Int, _ m: Int, _ d: Int, _ h: Int, _ min: Int = 0) -> Date {
        var c = DateComponents(); c.year = y; c.month = m; c.day = d; c.hour = h; c.minute = min
        return calendar.date(from: c)!
    }

    // MARK: Decoding

    func testDealDecodesWithRecurringFields() throws {
        let json = """
        {
          "id": "d1", "title": "Happy Hour", "business_name": "El Bait Shop",
          "entity_type": "restaurant", "deal_type": "percentage",
          "discount_value": "50%", "start_date": "2026-01-01T00:00:00Z",
          "end_date": "2026-12-31T00:00:00Z", "is_featured": true,
          "days_of_week": ["mon","tue","wed","thu","fri"],
          "start_time": "15:00:00", "end_time": "18:00:00"
        }
        """.data(using: .utf8)!
        let deal = try JSONDecoder().decode(Deal.self, from: json)
        XCTAssertEqual(deal.businessName, "El Bait Shop")
        XCTAssertTrue(deal.isRecurring)
        XCTAssertTrue(deal.isSponsored)
        XCTAssertEqual(deal.valueLabel, "50% Off")
        XCTAssertEqual(deal.dealTypeLabel, "% Off")
    }

    // MARK: Schedule rendering

    func testScheduleRendersConsecutiveDaysAsRange() {
        XCTAssertEqual(Deal.preview.scheduleText, "Mon–Fri · 3:00 PM–6:00 PM")
    }

    func testScheduleRendersDailyAndNonConsecutive() {
        var daily = Deal.preview
        daily.daysOfWeek = ["mon","tue","wed","thu","fri","sat","sun"]
        daily.startTime = nil; daily.endTime = nil
        XCTAssertEqual(daily.scheduleText, "Daily")

        var weekends = Deal.preview
        weekends.daysOfWeek = ["sat","sun"]; weekends.startTime = nil; weekends.endTime = nil
        XCTAssertEqual(weekends.scheduleText, "Sat–Sun")

        var split = Deal.preview
        split.daysOfWeek = ["mon","wed","fri"]; split.startTime = nil; split.endTime = nil
        XCTAssertEqual(split.scheduleText, "Mon, Wed, Fri")
    }

    func testNonRecurringHasNoSchedule() {
        var deal = Deal.preview
        deal.daysOfWeek = nil
        XCTAssertNil(deal.scheduleText)
        XCTAssertFalse(deal.isRecurring)
    }

    func testTimeLabelFormats24HourTime() {
        XCTAssertEqual(Deal.timeLabel("15:00:00"), "3:00 PM")
        XCTAssertEqual(Deal.timeLabel("09:30:00"), "9:30 AM")
        XCTAssertEqual(Deal.timeLabel("00:00:00"), "12:00 AM")
    }

    // MARK: Active-now (recurring window)

    func testActiveNowRespectsDayAndTimeWindow() {
        let deal = Deal.preview // Mon–Fri 15:00–18:00
        // 2026-06-03 is a Wednesday.
        XCTAssertTrue(deal.isActiveNow(date(2026, 6, 3, 16), calendar: calendar))  // Wed 4pm → in window
        XCTAssertFalse(deal.isActiveNow(date(2026, 6, 3, 19), calendar: calendar)) // Wed 7pm → after
        XCTAssertFalse(deal.isActiveNow(date(2026, 6, 6, 16), calendar: calendar)) // Sat → wrong day
    }

    func testNonRecurringActiveWithinDateWindow() {
        var deal = Deal.preview
        deal.daysOfWeek = nil
        XCTAssertTrue(deal.isActiveNow(date(2026, 6, 3, 3), calendar: calendar))
    }
}
