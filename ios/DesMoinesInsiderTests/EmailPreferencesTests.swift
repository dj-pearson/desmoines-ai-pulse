import XCTest
@testable import DesMoinesInsider

/// IOS-DD-ACCOUNT-10: no user_email_preferences row means no digest, since
/// get_weekly_digest_recipients selects only users with a true row.
final class EmailPreferencesTests: XCTestCase {
    func testEmptyResultIsOff() {
        XCTAssertFalse(EmailPreferencesService.decode(Data("[]".utf8)))
    }

    func testRowValueIsUsed() {
        XCTAssertTrue(EmailPreferencesService.decode(Data(#"[{"weekly_digest_enabled":true}]"#.utf8)))
        XCTAssertFalse(EmailPreferencesService.decode(Data(#"[{"weekly_digest_enabled":false}]"#.utf8)))
    }

    func testNullOrGarbageIsOff() {
        XCTAssertFalse(EmailPreferencesService.decode(Data(#"[{"weekly_digest_enabled":null}]"#.utf8)))
        XCTAssertFalse(EmailPreferencesService.decode(Data("oops".utf8)))
    }
}
