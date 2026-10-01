import XCTest
@testable import DesMoinesInsider

/// IOS-DD-PLATFORM-14: VoiceOver hears connectivity edges, and only edges.
final class NetworkMonitorTests: XCTestCase {

    func testAnnouncementsOnEdgesOnly() {
        XCTAssertEqual(
            NetworkMonitor.announcement(wasConnected: true, isConnected: false),
            "No internet connection. Showing saved content."
        )
        XCTAssertEqual(NetworkMonitor.announcement(wasConnected: false, isConnected: true), "Back online")
        XCTAssertNil(NetworkMonitor.announcement(wasConnected: true, isConnected: true))
        XCTAssertNil(NetworkMonitor.announcement(wasConnected: false, isConnected: false))
    }
}
