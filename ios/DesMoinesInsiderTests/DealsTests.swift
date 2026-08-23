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

    // MARK: - IOS-AUDIT-PERF-022: derived state is stored, except the clock-dependent part

    private func deals(_ specs: [(id: String, title: String, business: String, type: String, desc: String?)]) -> [Deal] {
        let rows = specs.map { spec -> String in
            let description = spec.desc.map { "\"description\": \"\($0)\"," } ?? ""
            return """
            {"id": "\(spec.id)", "title": "\(spec.title)", \(description)
             "business_name": "\(spec.business)", "entity_type": "\(spec.type)",
             "deal_type": "percentage"}
            """
        }
        let json = "[\(rows.joined(separator: ","))]".data(using: .utf8)!
        return (try? JSONDecoder().decode([Deal].self, from: json)) ?? []
    }

    @MainActor
    func testCategoriesAreUniqueAndSorted() {
        let vm = DealsViewModel(deals: deals([
            ("1", "A", "Biz", "restaurant", nil),
            ("2", "B", "Biz", "attraction", nil),
            ("3", "C", "Biz", "restaurant", nil),
        ]))
        XCTAssertEqual(vm.categories, ["attraction", "restaurant"])
    }

    @MainActor
    func testCategoryFilterNarrowsTheStoredList() {
        let vm = DealsViewModel(deals: deals([
            ("1", "A", "Biz", "restaurant", nil),
            ("2", "B", "Biz", "attraction", nil),
        ]))
        XCTAssertEqual(vm.matchingDeals.count, 2)

        vm.selectedCategory = "restaurant"
        XCTAssertEqual(vm.matchingDeals.map(\.id), ["1"], "didSet must recompute, not wait for a read")

        vm.selectedCategory = nil
        XCTAssertEqual(vm.matchingDeals.count, 2)
    }

    @MainActor
    func testSearchMatchesTitleBusinessAndDescriptionCaseInsensitively() {
        let vm = DealsViewModel(deals: deals([
            ("1", "Half Price Pizza", "Tonys", "restaurant", nil),
            ("2", "Free Coffee", "Bean Co", "restaurant", nil),
            ("3", "Museum Entry", "Science Center", "attraction", "Kids go free"),
        ]))

        vm.searchText = "PIZZA"
        XCTAssertEqual(vm.matchingDeals.map(\.id), ["1"], "title match, case-insensitive")

        vm.searchText = "bean"
        XCTAssertEqual(vm.matchingDeals.map(\.id), ["2"], "business name match")

        vm.searchText = "kids"
        XCTAssertEqual(vm.matchingDeals.map(\.id), ["3"], "description match")

        vm.searchText = "   "
        XCTAssertEqual(vm.matchingDeals.count, 3, "a whitespace-only query is not a filter")
    }

    /// The reason filteredDeals is NOT stored, contrary to what the AC asks for.
    ///
    /// isActiveNow() reads the current time. Caching its result would freeze the
    /// filter at whenever the last recompute ran, so a deal would keep showing as
    /// open after its window closed. The split is: matchingDeals holds everything
    /// clock-independent, filteredDeals applies the time predicate at read time.
    @MainActor
    func testActiveNowFilterIsNotBakedIntoTheStoredList() {
        let vm = DealsViewModel(deals: deals([
            ("1", "A", "Biz", "restaurant", nil),
            ("2", "B", "Biz", "restaurant", nil),
        ]))

        vm.activeNowOnly = true
        XCTAssertEqual(vm.matchingDeals.count, 2, "the stored list must never have the time filter applied")

        vm.activeNowOnly = false
        XCTAssertEqual(vm.filteredDeals.map(\.id), vm.matchingDeals.map(\.id))
    }
}
