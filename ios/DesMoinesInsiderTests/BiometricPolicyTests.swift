import XCTest
@testable import DesMoinesInsider

/// IOS-DD-ACCOUNT-05: only a real failed match counts toward the lock
/// screen's retry limit. Dismissing the prompt is not a failed attempt.
final class BiometricPolicyTests: XCTestCase {
    func testCancelAndUnavailableDoNotCount() {
        XCTAssertFalse(BiometricAuthService.countsAsFailure(.cancelled))
        XCTAssertFalse(BiometricAuthService.countsAsFailure(.unavailable))
        XCTAssertFalse(BiometricAuthService.countsAsFailure(.success))
    }

    func testFailedCounts() {
        XCTAssertTrue(BiometricAuthService.countsAsFailure(.failed))
    }
}
