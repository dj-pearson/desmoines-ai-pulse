import XCTest
@testable import DesMoinesInsider

/// IOS-DD-EVENTS-14: when a reminder fires.
final class ReminderTimingTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_790_521_200) // 2026-09-27 15:00Z, 10:00 CDT

    func testThreeHoursAwayFiresAnHourBefore() {
        let start = now.addingTimeInterval(3 * 3600)
        XCTAssertEqual(
            LocalNotificationService.reminderFireDate(eventStart: start, hasSpecificTime: true, now: now),
            start.addingTimeInterval(-3600)
        )
    }

    func testFortyMinutesAwayFiresFifteenBefore() {
        let start = now.addingTimeInterval(40 * 60)
        XCTAssertEqual(
            LocalNotificationService.reminderFireDate(eventStart: start, hasSpecificTime: true, now: now),
            start.addingTimeInterval(-15 * 60)
        )
    }

    func testTenMinutesAwayIsTooLate() {
        let start = now.addingTimeInterval(10 * 60)
        XCTAssertNil(LocalNotificationService.reminderFireDate(eventStart: start, hasSpecificTime: true, now: now))
    }

    func testTimeTBATomorrowFiresAtNineCentral() {
        // Tomorrow's 19:31:58 CDT marker = 2026-09-29 00:31:58Z.
        let start = Date(timeIntervalSince1970: 1_790_641_918)
        let fire = LocalNotificationService.reminderFireDate(eventStart: start, hasSpecificTime: false, now: now)
        // 2026-09-28 09:00 CDT = 14:00Z.
        XCTAssertEqual(fire.map(DateParser.toISO), "2026-09-28T14:00:00Z")
    }
}
