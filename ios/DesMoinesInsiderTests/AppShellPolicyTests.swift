import XCTest
@testable import DesMoinesInsider

/// App-shell decisions extracted from DesMoinesInsiderApp and MainTabView.
@MainActor
final class AppShellPolicyTests: XCTestCase {

    // MARK: - Biometric lock overlay (IOS-DD-PLATFORM-05)

    func testLockShowsOnlyWhenAwaitingAndSignedIn() {
        XCTAssertTrue(DesMoinesInsiderApp.shouldShowLock(awaiting: true, authenticated: true))
        XCTAssertFalse(DesMoinesInsiderApp.shouldShowLock(awaiting: true, authenticated: false))
        XCTAssertFalse(DesMoinesInsiderApp.shouldShowLock(awaiting: false, authenticated: true))
        XCTAssertFalse(DesMoinesInsiderApp.shouldShowLock(awaiting: false, authenticated: false))
    }

    // MARK: - Jailbreak warning once per version (IOS-DD-PLATFORM-15)

    func testJailbreakWarningShowsOncePerVersion() {
        XCTAssertTrue(DesMoinesInsiderApp.shouldWarnJailbreak(isJailbroken: true, ackVersion: "", current: "1.2.0"))
        XCTAssertFalse(DesMoinesInsiderApp.shouldWarnJailbreak(isJailbroken: true, ackVersion: "1.2.0", current: "1.2.0"))
        XCTAssertTrue(DesMoinesInsiderApp.shouldWarnJailbreak(isJailbroken: true, ackVersion: "1.1.0", current: "1.2.0"))
        XCTAssertFalse(DesMoinesInsiderApp.shouldWarnJailbreak(isJailbroken: false, ackVersion: "", current: "1.2.0"))
    }
}
