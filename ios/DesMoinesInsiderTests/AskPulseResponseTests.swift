import XCTest
@testable import DesMoinesInsider

/// IOS-DD-DISCOVER-13/14/16: what Ask Pulse decodes and how it reads errors.
final class AskPulseResponseTests: XCTestCase {

    private func decode(_ json: String) throws -> AskPulseService.Response {
        try JSONDecoder().decode(AskPulseService.Response.self, from: Data(json.utf8))
    }

    // MARK: Crisis (D7-13)

    func testACrisisResponseDecodesWithItsResources() throws {
        // Exactly the body discover-chat returns (crisisPayload plus the two
        // empty arrays kept for older clients).
        let json = """
        {"picks":[],"followUpSuggestions":[],"crisis":true,"message":"You don't have to go through this alone.",
         "resources":[{"name":"988 Suicide & Crisis Lifeline","contact":"Call or text 988","description":"Free, confidential support 24/7."}]}
        """
        let response = try decode(json)

        XCTAssertEqual(response.crisis, true)
        XCTAssertEqual(response.resources?.count, 1)
        XCTAssertEqual(response.resources?.first?.contact, "Call or text 988")
        XCTAssertNil(response.usage)
        XCTAssertTrue(response.picks.isEmpty)
    }

    func testAnOrdinaryResponseHasNoCrisisFlag() throws {
        let response = try decode(#"{"picks":[],"followUpSuggestions":["cheaper"],"usage":{"remaining":3,"tier":"free"}}"#)

        XCTAssertNil(response.crisis)
        XCTAssertEqual(response.followUpSuggestions, ["cheaper"])
    }

    func testMalformedFollowUpsDoNotFailTheResponse() throws {
        let response = try decode(#"{"picks":[],"followUpSuggestions":"not a list"}"#)
        XCTAssertEqual(response.followUpSuggestions, [])
    }

    // MARK: Errors (D7-14)

    private func body(_ json: String) -> Data { Data(json.utf8) }

    func testABudgetPauseIsNotSoldAnUpgrade() {
        XCTAssertEqual(
            AskPulseService.classify(status: 429, body: body(#"{"code":"ai_budget_paused","upgradeHint":null}"#)),
            .paused
        )
    }

    func testAQuotaHitCarriesTheUpgradeHint() {
        XCTAssertEqual(
            AskPulseService.classify(
                status: 429,
                body: body(#"{"code":"quota_exceeded","upgradeHint":"insider","retryAfter":3600}"#)
            ),
            .quota(upgradeHint: "insider", retryAfter: 3600)
        )
    }

    func testVIPHitsTheQuotaWithNoUpsell() {
        XCTAssertEqual(
            AskPulseService.classify(status: 429, body: body(#"{"code":"quota_exceeded","upgradeHint":null}"#)),
            .quota(upgradeHint: nil, retryAfter: nil)
        )
    }

    func testUnauthorizedMeansSignIn() {
        XCTAssertEqual(AskPulseService.classify(status: 401, body: body("{}")), .signInRequired)
    }

    func testTheServersOwnMessageIsKept() {
        XCTAssertEqual(
            AskPulseService.classify(status: 502, body: body(#"{"error":"Pulse is taking a breather. Try again in a moment."}"#)),
            .server(message: "Pulse is taking a breather. Try again in a moment.")
        )
    }

    func testTheBurstLimiterSaysWhatItSays() {
        // The per-IP limiter's 429 has no code; it is not the daily quota.
        XCTAssertEqual(
            AskPulseService.classify(status: 429, body: body(#"{"error":"Too many discover-chat requests. Please slow down."}"#)),
            .server(message: "Too many discover-chat requests. Please slow down.")
        )
    }

    // MARK: Picks and history (D7-16)

    func testAPickDecodesWithAndWithoutTheEnrichment() throws {
        let bare = try decode(#"{"picks":[{"itemType":"event","itemId":"e1","reason":"Live jazz"}],"followUpSuggestions":[]}"#)
        XCTAssertNil(bare.picks.first?.title)

        let rich = try decode("""
        {"picks":[{"itemType":"event","itemId":"e1","reason":"Live jazz","title":"Jazz in July",
          "imageUrl":"https://x/y.jpg","startsAt":"2026-07-10T19:00:00-05:00","venue":"Water Works Park"}],
         "followUpSuggestions":[]}
        """)
        XCTAssertEqual(rich.picks.first?.title, "Jazz in July")
        XCTAssertEqual(rich.picks.first?.venue, "Water Works Park")
    }

    func testTheModelSummaryNamesEachPickAndItsId() {
        let picks = [
            AskPulseService.Pick(itemType: .event, itemId: "e1", reason: "Live jazz", title: "Jazz in July"),
            AskPulseService.Pick(itemType: .restaurant, itemId: "r9", reason: "Late kitchen"),
        ]

        let summary = AskPulseService.modelSummary(picks)

        XCTAssertTrue(summary.contains("e1"))
        XCTAssertTrue(summary.contains("r9"))
        XCTAssertTrue(summary.contains("Jazz in July"))
        XCTAssertEqual(AskPulseService.modelSummary([]), "No picks.")
    }

    func testRequestMessagesSendModelContentAndOnlyTheLastTen() {
        var messages: [AskPulseService.ChatMessage] = (0..<12).map {
            AskPulseService.ChatMessage(role: $0 % 2 == 0 ? .user : .assistant, content: "m\($0)")
        }
        messages[11] = AskPulseService.ChatMessage(role: .assistant, content: "Here are 2 ideas.", modelContent: "Picked: 1. X")

        let sent = AskPulseService.requestMessages(messages)

        XCTAssertEqual(sent.count, 10)
        XCTAssertEqual(sent.first?.content, "m2")
        XCTAssertEqual(sent.last?.content, "Picked: 1. X")
        XCTAssertEqual(sent.last?.role, "assistant")
    }
}
