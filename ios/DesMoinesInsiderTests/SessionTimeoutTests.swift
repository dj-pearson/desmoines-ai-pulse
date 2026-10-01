import XCTest
@testable import DesMoinesInsider

/// IOS-DD-ACCOUNT-02: timeouts apply to admin sessions only, and the absolute
/// clock survives token refreshes and relaunches.
///
/// Uses the real Keychain keys SessionTimeoutService writes; every test starts
/// and ends with stopTracking(), which deletes them. Skips when the keychain is
/// not writable in this environment (see KeychainServiceTests).
@MainActor
final class SessionTimeoutTests: XCTestCase {
    private let startKey = "session_start_time"
    private let activityKey = "session_last_activity"
    private let adminKey = "session_is_admin"

    private var service: SessionTimeoutService { SessionTimeoutService.shared }
    private var keychain: KeychainService { KeychainService.shared }

    override func setUp() {
        super.setUp()
        service.stopTracking()
    }

    override func tearDown() {
        service.stopTracking()
        super.tearDown()
    }

    private func requireKeychain() throws {
        guard keychain.saveString(key: "session_timeout_probe", value: "1") else {
            throw XCTSkip("Keychain is not writable in this environment.")
        }
        keychain.delete(key: "session_timeout_probe")
    }

    func testRegularUserIsNotTracked() throws {
        try requireKeychain()
        service.startTracking(isAdmin: false, resetClock: true)

        XCTAssertTrue(service.isSessionValid())
        XCTAssertEqual(service.sessionState, .active)
        XCTAssertNil(keychain.loadString(key: startKey), "a regular user gets no clock")
        XCTAssertFalse(service.expireIfStaleOnLaunch())
    }

    func testRefreshDoesNotResetAbsoluteClock() throws {
        try requireKeychain()
        let now = Date().timeIntervalSince1970
        let fiveHoursAgo = String(now - 5 * 60 * 60)
        keychain.saveString(key: startKey, value: fiveHoursAgo)
        keychain.saveString(key: activityKey, value: String(now))
        keychain.saveString(key: adminKey, value: "1")

        // A token refresh, then a cold launch, for the same admin.
        service.updateRole(isAdmin: true)
        service.startTracking(isAdmin: true, resetClock: false)

        XCTAssertEqual(keychain.loadString(key: startKey), fiveHoursAgo)
        XCTAssertTrue(service.expireIfStaleOnLaunch(), "5h is past the 4h admin limit")
    }

    func testFreshSignInResetsClock() throws {
        try requireKeychain()
        let now = Date().timeIntervalSince1970
        let fiveHoursAgo = String(now - 5 * 60 * 60)
        keychain.saveString(key: startKey, value: fiveHoursAgo)
        keychain.saveString(key: activityKey, value: fiveHoursAgo)
        keychain.saveString(key: adminKey, value: "1")

        service.startTracking(isAdmin: true, resetClock: true)

        let stored = try XCTUnwrap(keychain.loadString(key: startKey).flatMap(Double.init))
        XCTAssertGreaterThan(stored, now - 60)
        XCTAssertFalse(service.expireIfStaleOnLaunch())
    }

    /// Data an older build left for a regular user must not sign them out.
    func testLegacyRegularUserDataIsNotAnExpiry() throws {
        try requireKeychain()
        let old = String(Date().timeIntervalSince1970 - 24 * 60 * 60)
        keychain.saveString(key: startKey, value: old)
        keychain.saveString(key: activityKey, value: old)
        keychain.saveString(key: adminKey, value: "0")

        XCTAssertFalse(service.expireIfStaleOnLaunch())
    }
}
