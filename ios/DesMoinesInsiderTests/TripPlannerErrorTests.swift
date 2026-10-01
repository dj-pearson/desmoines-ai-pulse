import XCTest
@testable import DesMoinesInsider

/// IOS-DD-TRIP-PLANNER-03: every generate-itinerary refusal used to read "Try
/// adjusting your dates or interests". The bodies below are the literal JSON
/// the function sends (generate-itinerary/index.ts and _shared/aiQuota.ts
/// denialBody), so a change on either side shows up here.
@MainActor
final class TripPlannerErrorTests: XCTestCase {
    private typealias E = TripPlannerService.TripPlannerError

    private func classify(_ status: Int, _ json: String) -> E? {
        TripPlannerService.classify(status: status, body: Data(json.utf8))
    }

    func testUnauthenticatedIsSignInRequired() {
        XCTAssertEqual(
            classify(401, #"{"success":false,"error":"Sign in to plan a trip.","code":"sign_in_required"}"#),
            .signInRequired
        )
    }

    func testUpgradeRequired() {
        let body = #"{"error":"Trip Planner is an Insider feature. Please upgrade to continue.","code":"upgrade_required","feature":"trip_planner","requiredTier":"insider","tier":"free"}"#
        XCTAssertEqual(classify(403, body), .needsUpgrade(message: "Trip Planner is an Insider feature. Please upgrade to continue."))
    }

    func testMonthlyQuota() {
        let body = #"{"error":"You've used all 5 trip plans included this month.","code":"quota_exceeded","feature":"trip_planner","tier":"insider","limit":5,"used":5,"requiredTier":"vip","upgradeHint":"vip"}"#
        XCTAssertEqual(classify(429, body), .monthlyQuota(message: "You've used all 5 trip plans included this month."))
    }

    func testDailyLimitIsNotTheMonthlyQuota() {
        let body = #"{"error":"You've reached today's limit of 3 trip plans. It resets at midnight Central.","code":"quota_exceeded","reason":"subject_limit","feature":"itinerary","tier":"insider","limit":3,"upgradeHint":"vip","retryAfter":3600,"period":"day"}"#
        XCTAssertEqual(classify(429, body), .dailyLimit(message: "You've reached today's limit of 3 trip plans. It resets at midnight Central."))
    }

    func testAiBudgetPauseIsUnavailable() {
        let body = #"{"error":"AI features are paused for the rest of the day. Please try again tomorrow.","code":"ai_budget_paused","reason":"provider_paused","feature":"itinerary","tier":"vip","limit":null,"upgradeHint":null,"retryAfter":3600}"#
        XCTAssertEqual(classify(429, body), .unavailable(message: "AI features are paused for the rest of the day. Please try again tomorrow."))
    }

    func testStorageOutageIsUnavailable() {
        let body = #"{"success":false,"error":"Trip planning is temporarily unavailable. No plan was used from your monthly allowance.","code":"trip_storage_unavailable"}"#
        XCTAssertEqual(classify(500, body), .unavailable(message: "Trip planning is temporarily unavailable. No plan was used from your monthly allowance."))
    }

    func testBadRequestCarriesTheServerMessage() {
        let body = #"{"success":false,"error":"Trips can be up to 14 days.","code":"trip_too_long"}"#
        XCTAssertEqual(classify(400, body), .server(message: "Trips can be up to 14 days."))
    }

    func testGeneric500WithAMessageIsServer() {
        let body = #"{"success":false,"error":"Failed to generate itinerary. Please try again."}"#
        XCTAssertEqual(classify(500, body), .server(message: "Failed to generate itinerary. Please try again."))
    }

    func testEmptyBodyAndSuccessAreNil() {
        XCTAssertNil(TripPlannerService.classify(status: 500, body: Data()))
        XCTAssertNil(classify(200, #"{"success":true}"#))
    }

    func testUnavailableFallsBackToThePausedLine() {
        XCTAssertEqual(E.unavailable(message: nil).errorDescription, TripPlannerAvailability.pausedMessage)
    }
}
