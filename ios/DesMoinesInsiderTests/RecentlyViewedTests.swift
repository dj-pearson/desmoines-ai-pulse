import XCTest
@testable import DesMoinesInsider

/// IOS-PARITY-007 — recently-viewed ordering/dedupe/cap. The Dashboard screen
/// itself is exercised by the macOS build + UI tests in CI.
@MainActor
final class RecentlyViewedTests: XCTestCase {

    private var service: RecentlyViewedService { RecentlyViewedService.shared }

    override func setUp() {
        super.setUp()
        service.clear()
    }

    override func tearDown() {
        service.clear()
        super.tearDown()
    }

    func testRecordPutsNewestFirst() {
        service.record(type: "event", id: "1", title: "Concert", imageUrl: nil)
        service.record(type: "restaurant", id: "2", title: "Centro", imageUrl: nil)
        XCTAssertEqual(service.recent.count, 2)
        XCTAssertEqual(service.recent.first?.itemId, "2")
        XCTAssertEqual(service.recent.first?.type, "restaurant")
    }

    func testReRecordMovesToFrontWithoutDuplicating() {
        service.record(type: "event", id: "1", title: "Concert", imageUrl: nil)
        service.record(type: "event", id: "2", title: "Festival", imageUrl: nil)
        service.record(type: "event", id: "1", title: "Concert", imageUrl: nil)
        XCTAssertEqual(service.recent.count, 2)
        XCTAssertEqual(service.recent.first?.itemId, "1")
    }

    func testEmptyFieldsAreIgnored() {
        service.record(type: "event", id: "", title: "No id", imageUrl: nil)
        service.record(type: "event", id: "9", title: "", imageUrl: nil)
        XCTAssertTrue(service.recent.isEmpty)
    }

    func testCapIsEnforced() {
        for i in 0..<20 {
            service.record(type: "event", id: "\(i)", title: "Event \(i)", imageUrl: nil)
        }
        XCTAssertEqual(service.recent.count, 12)
        // Most recent (id 19) is first; oldest kept is id 8 (20 - 12).
        XCTAssertEqual(service.recent.first?.itemId, "19")
        XCTAssertEqual(service.recent.last?.itemId, "8")
    }

    func testRecentItemSystemImageByType() {
        let event = RecentlyViewedService.RecentItem(type: "event", itemId: "1", title: "x", imageUrl: nil)
        let restaurant = RecentlyViewedService.RecentItem(type: "restaurant", itemId: "1", title: "x", imageUrl: nil)
        XCTAssertEqual(event.systemImage, "calendar")
        XCTAssertEqual(restaurant.systemImage, "fork.knife")
    }
}
