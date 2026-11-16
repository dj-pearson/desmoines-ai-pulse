import XCTest
@testable import DesMoinesInsider

private struct StubForYouError: Error {
    let code: String?
}

/// XPLAT-016 / WEB-FEAT-034: For You asks get_personalized_recommendations_v2,
/// which honours the "Personalized suggestions" opt-out server-side. Only a
/// missing-function error may send the call back to v1, which does not check
/// it; any other error leaves the rail on trending.
final class ForYouServiceFallbackTests: XCTestCase {

    func testMissingFunctionCodesFallBackToV1() {
        XCTAssertTrue(ForYouService.isMissingFunctionError(StubForYouError(code: "PGRST202")))
        XCTAssertTrue(ForYouService.isMissingFunctionError(StubForYouError(code: "42883")))
    }

    func testOtherErrorsDoNotReachV1() {
        XCTAssertFalse(ForYouService.isMissingFunctionError(StubForYouError(code: "42501")))
        XCTAssertFalse(ForYouService.isMissingFunctionError(StubForYouError(code: "PGRST301")))
        XCTAssertFalse(ForYouService.isMissingFunctionError(StubForYouError(code: nil)))
        XCTAssertFalse(ForYouService.isMissingFunctionError(URLError(.notConnectedToInternet)))
    }
}
