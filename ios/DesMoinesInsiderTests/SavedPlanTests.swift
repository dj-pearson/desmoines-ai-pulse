import XCTest
@testable import DesMoinesInsider

/// IOS-DD-SAVED-18/25: the Saved tab as a plan for the week, and its share
/// text. Every time is fixed and read in Central (CDT is UTC-5 here).
final class SavedPlanTests: XCTestCase {

    private func at(_ iso: String) -> Date {
        // swiftlint:disable:next force_unwrapping
        ISO8601DateFormatter().date(from: iso)!
    }

    private func event(_ id: String, _ date: String, title: String? = nil) -> Event {
        Event(id: id, title: title ?? "Event \(id)", date: date)
    }

    /// Wednesday 2026-09-30 12:00 CDT.
    private var wednesdayNoon: Date { at("2026-09-30T17:00:00Z") }

    private func bucket(_ e: Event, now: Date) -> SavedEventBucket {
        SavedPlan.bucket(for: e, now: now)
    }

    func testBucketsOnAWednesday() {
        let now = wednesdayNoon
        // 11:00 CDT, timed, started an hour ago.
        XCTAssertEqual(bucket(event("now", "2026-09-30T16:00:00Z"), now: now), .happeningNow)
        // 19:00 CDT today.
        XCTAssertEqual(bucket(event("today", "2026-10-01T00:00:00Z"), now: now), .today)
        // Saturday 19:00 CDT.
        XCTAssertEqual(bucket(event("sat", "2026-10-04T00:00:00Z"), now: now), .thisWeekend)
        // Next Tuesday 19:00 CDT.
        XCTAssertEqual(bucket(event("tue", "2026-10-07T00:00:00Z"), now: now), .nextSevenDays)
        // Twenty days out.
        XCTAssertEqual(bucket(event("later", "2026-10-20T00:00:00Z"), now: now), .later)
        // Yesterday 19:00 CDT, over at 22:00.
        XCTAssertEqual(bucket(event("past", "2026-09-30T00:00:00Z"), now: now), .past)
    }

    func testSundayIsThisWeekendOnASaturday() {
        let saturdayNoon = at("2026-10-03T17:00:00Z")
        XCTAssertEqual(bucket(event("sun", "2026-10-05T00:00:00Z"), now: saturdayNoon), .thisWeekend)
    }

    func testAnUntimedEventThatStartedTodayIsToday() {
        var e = event("tba", "2026-09-30T14:00:00Z")
        e.timeTbd = true
        XCTAssertEqual(bucket(e, now: wednesdayNoon), .today)
    }

    func testAnEventWithNoDateIsLater() {
        XCTAssertEqual(bucket(event("nodate", ""), now: wednesdayNoon), .later)
    }

    func testArrangeDropsEmptyBucketsAndSortsPastNewestFirst() {
        let events = [
            event("sat", "2026-10-04T00:00:00Z"),
            event("old", "2026-09-20T00:00:00Z"),
            event("recent", "2026-09-29T00:00:00Z"),
            event("fri", "2026-10-03T00:00:00Z"),
        ]
        let groups = SavedPlan.arrange(events, now: wednesdayNoon)
        XCTAssertEqual(groups.map(\.bucket), [.thisWeekend, .past])
        XCTAssertEqual(groups[0].events.map(\.id), ["fri", "sat"])
        XCTAssertEqual(groups[1].events.map(\.id), ["recent", "old"])
    }

    func testArrangeBreaksTiesOnId() {
        let events = [event("b", "2026-10-04T00:00:00Z"), event("a", "2026-10-04T00:00:00Z")]
        let groups = SavedPlan.arrange(events, now: wednesdayNoon)
        XCTAssertEqual(groups.first?.events.map(\.id), ["a", "b"])
    }

    func testWeekendHeadlineCountsFreePlans() {
        var free = event("f", "2026-10-04T00:00:00Z")
        free.price = "Free"
        let paid = event("p", "2026-10-03T00:00:00Z")
        let groups = SavedPlan.arrange([free, paid], now: wednesdayNoon)
        XCTAssertEqual(SavedPlan.weekendHeadline(groups), "This weekend: 2 plans, 1 free")
        XCTAssertNil(SavedPlan.weekendHeadline([]))
    }

    // MARK: - Share text

    func testShareText() {
        let upcoming = event("e1", "2026-10-04T00:00:00Z", title: "Jazz in the Park")
        let past = event("e0", "2026-09-20T00:00:00Z", title: "Old Show")
        let groups = SavedPlan.arrange([upcoming, past], now: wednesdayNoon)
        let text = SavedPlan.shareText(
            groups: groups,
            restaurants: [Restaurant(id: "r1", name: "Centro")],
            attractions: [],
            title: "My Des Moines plans"
        )

        XCTAssertTrue(text.hasPrefix("My Des Moines plans"))
        XCTAssertTrue(text.contains("https://desmoinesinsider.com/events/e1"))
        XCTAssertTrue(text.contains("/restaurants/r1"))
        XCTAssertFalse(text.contains("Old Show"))
        XCTAssertFalse(text.contains("/events/e0"))
        for line in text.split(separator: "\n", omittingEmptySubsequences: false) {
            XCTAssertEqual(String(line), line.trimmingCharacters(in: .whitespaces))
        }
    }
}

/// IOS-DD-SAVED-19: the Saved tab's segments.
final class SavedSegmentTests: XCTestCase {

    func testThereAreFiveSegments() {
        XCTAssertEqual(SavedSegment.allCases.count, 5)
    }

    func testWhatEachSegmentShows() {
        XCTAssertEqual(SavedSegment.allCases.map(SavedSegment.showsEvents), [true, true, false, false, false])
        XCTAssertEqual(SavedSegment.allCases.map(SavedSegment.showsDining), [true, false, true, false, false])
        XCTAssertEqual(SavedSegment.allCases.map(SavedSegment.showsPlaces), [true, false, false, true, false])
        XCTAssertEqual(SavedSegment.allCases.map(SavedSegment.showsGuides), [true, false, false, false, true])
    }
}
