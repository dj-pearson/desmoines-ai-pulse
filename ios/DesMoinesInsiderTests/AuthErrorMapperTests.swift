import XCTest
@testable import DesMoinesInsider

/// IOS-DD-ACCOUNT-06: auth errors become fixed copy, never raw server text
/// (except the unclassified case).
final class AuthErrorMapperTests: XCTestCase {

    private func error(_ message: String) -> NSError {
        NSError(domain: "AuthError", code: 400, userInfo: [NSLocalizedDescriptionKey: message])
    }

    func testEmailNotConfirmed() {
        XCTAssertEqual(AuthErrorMapper.classify(error("Email not confirmed")), .emailNotConfirmed)
        XCTAssertEqual(AuthErrorMapper.classify(error("code: email_not_confirmed")), .emailNotConfirmed)
    }

    func testInvalidCredentials() {
        XCTAssertEqual(AuthErrorMapper.classify(error("Invalid login credentials")), .invalidCredentials)
        XCTAssertEqual(AuthErrorMapper.classify(error("invalid_credentials")), .invalidCredentials)
    }

    func testRateLimited() {
        XCTAssertEqual(AuthErrorMapper.classify(error("Request rate limit reached")), .rateLimited)
        XCTAssertEqual(AuthErrorMapper.classify(error("over_request_rate_limit")), .rateLimited)
    }

    func testNetwork() {
        XCTAssertEqual(AuthErrorMapper.classify(URLError(.notConnectedToInternet)), .network)
    }

    func testOtherPassesTheTextThrough() {
        XCTAssertEqual(AuthErrorMapper.classify(error("Password should contain a symbol")), .other("Password should contain a symbol"))
        XCTAssertEqual(
            AuthErrorMapper.message(for: .other("Password should contain a symbol"), mode: .signUp),
            "Password should contain a symbol"
        )
    }

    func testFixedCopy() {
        XCTAssertEqual(AuthErrorMapper.message(for: .invalidCredentials, mode: .signIn), "Email or password is incorrect.")
        XCTAssertEqual(AuthErrorMapper.message(for: .rateLimited, mode: .signIn), "Too many attempts. Wait a minute and try again.")
    }
}
