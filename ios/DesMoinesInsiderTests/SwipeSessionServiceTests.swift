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

    // MARK: Lookup by code (WEB-SEC-070)

    private func session(status: String = "active", expiresAt: String?) -> SwipeSessionService.Session {
        SwipeSessionService.Session(
            id: UUID(), code: "DSM-AB12", mode: "mixed", status: status,
            expiresAt: expiresAt, endedAt: nil,
        )
    }

    private let now = ISO8601DateFormatter().date(from: "2026-11-16T12:00:00Z")!

    func testAnActiveUnexpiredSessionIsJoinable() {
        XCTAssertTrue(SwipeSessionService.isJoinable(session(expiresAt: "2026-11-16T13:00:00+00:00"), now: now))
    }

    func testFractionalSecondsParse() {
        // PostgREST sends timestamptz with microseconds.
        XCTAssertTrue(SwipeSessionService.isJoinable(session(expiresAt: "2026-11-16T13:00:00.123456+00:00"), now: now))
    }

    func testAnExpiredSessionIsNotJoinable() {
        // lookup_swipe_session returns every status and expiry, so the filter
        // the old table read applied server-side now runs here.
        XCTAssertFalse(SwipeSessionService.isJoinable(session(expiresAt: "2026-11-16T11:59:59Z"), now: now))
    }

    func testAnEndedSessionIsNotJoinable() {
        XCTAssertFalse(SwipeSessionService.isJoinable(session(status: "ended", expiresAt: "2026-11-16T13:00:00Z"), now: now))
    }

    func testAnUnparseableExpiryIsNotJoinable() {
        XCTAssertFalse(SwipeSessionService.isJoinable(session(expiresAt: "tomorrow"), now: now))
    }

    func testAMissingFunctionFallsBackToTheTableRead() {
        // Migration 20261108000096 not applied yet.
        XCTAssertTrue(SwipeSessionService.isMissingFunctionError(StubPostgrestError(code: "PGRST202")))
        XCTAssertTrue(SwipeSessionService.isMissingFunctionError(StubPostgrestError(code: "42883")))
    }

    func testOtherErrorsDoNotFallBack() {
        // A refusal or an outage must surface, not quietly retry the read
        // slice 3 retires.
        XCTAssertFalse(SwipeSessionService.isMissingFunctionError(StubPostgrestError(code: "42501")))
        XCTAssertFalse(SwipeSessionService.isMissingFunctionError(URLError(.notConnectedToInternet)))
    }

    func testTheFeatureStaysHiddenUntilTheGameIsWired() {
        // Hosting and joining work; swiping inside a session does not exist
        // yet, so a group would never see a match (D7-DEF-01).
        XCTAssertFalse(GroupSessionFeature.isEnabled)
    }
}
