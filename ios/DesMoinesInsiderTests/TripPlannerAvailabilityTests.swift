import XCTest
@testable import DesMoinesInsider

/// A PostgREST-shaped error. The test target does not link Supabase, so the
/// classifier reads `code` structurally (FavoritesService.errorCode).
private struct StubTripPostgrestError: Error {
    let code: String
}

/// IOS-DD-TRIP-PLANNER-01: only "no such relation" pauses the planner. A
/// missing column or a dropped connection says nothing about the table.
final class TripPlannerAvailabilityTests: XCTestCase {
    func testMissingRelationCodesPause() {
        XCTAssertTrue(TripPlannerAvailability.isMissingStorage(StubTripPostgrestError(code: "42P01")))
        XCTAssertTrue(TripPlannerAvailability.isMissingStorage(StubTripPostgrestError(code: "PGRST205")))
    }

    func testOtherErrorsDoNotPause() {
        XCTAssertFalse(TripPlannerAvailability.isMissingStorage(StubTripPostgrestError(code: "42703")))
        XCTAssertFalse(TripPlannerAvailability.isMissingStorage(URLError(.notConnectedToInternet)))
    }
}
