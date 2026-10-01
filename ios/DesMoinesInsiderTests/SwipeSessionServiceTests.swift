import XCTest
@testable import DesMoinesInsider

/// A PostgREST-shaped error. The test target does not link Supabase, so the
/// service reads `code` structurally (as FavoritesService.errorCode does).
private struct StubPostgrestError: Error {
    let code: String
}

/// IOS-DD-DISCOVER-01: Group Session's client half.
///
/// generate_swipe_session_code RETURNS TEXT, which PostgREST sends as a bare
/// JSON string. The service decoded it as [{"code": ...}], so hosting threw a
/// DecodingError on every attempt. And joining swallowed every insert error,
/// so an RLS refusal read as a successful join.
final class SwipeSessionServiceTests: XCTestCase {

    // MARK: Code decoding

    func testABareJSONStringDecodes() throws {
        XCTAssertEqual(try SwipeSessionService.decodeSessionCode(Data(#""DSM-AB12""#.utf8)), "DSM-AB12")
    }

    func testARowSetStillDecodes() throws {
        XCTAssertEqual(try SwipeSessionService.decodeSessionCode(Data(#"[{"code":"DSM-AB12"}]"#.utf8)), "DSM-AB12")
    }

    func testAnEmptyRowSetThrows() {
        XCTAssertThrowsError(try SwipeSessionService.decodeSessionCode(Data("[]".utf8)))
    }

    func testNullThrows() {
        XCTAssertThrowsError(try SwipeSessionService.decodeSessionCode(Data("null".utf8)))
    }

    func testAMalformedCodeThrows() {
        // Shipped clients validate ^DSM-[A-Z0-9]{4}$ before joining.
        XCTAssertThrowsError(try SwipeSessionService.decodeSessionCode(Data(#""hello""#.utf8)))
    }

    // MARK: Already joined

    func testAUniqueViolationMeansAlreadyJoined() {
        XCTAssertTrue(SwipeSessionService.isAlreadyJoined(StubPostgrestError(code: "23505")))
    }

    func testAnRLSRefusalIsNotAlreadyJoined() {
        XCTAssertFalse(SwipeSessionService.isAlreadyJoined(StubPostgrestError(code: "42501")))
    }

    func testANetworkErrorIsNotAlreadyJoined() {
        XCTAssertFalse(SwipeSessionService.isAlreadyJoined(URLError(.notConnectedToInternet)))
    }

    func testTheFeatureStaysHiddenUntilTheGameIsWired() {
        // Hosting and joining work; swiping inside a session does not exist
        // yet, so a group would never see a match (D7-DEF-01).
        XCTAssertFalse(GroupSessionFeature.isEnabled)
    }
}
