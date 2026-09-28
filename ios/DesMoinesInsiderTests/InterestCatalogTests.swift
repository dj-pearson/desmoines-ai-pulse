import XCTest
@testable import DesMoinesInsider

/// IOS-DD-ACCOUNT-03 / -04: the interest vocabulary and the cold-start rerank.
@MainActor
final class InterestCatalogTests: XCTestCase {

    /// src/lib/interests.ts. These ids are stored in profiles.interests, so a
    /// difference here orphans rows written by the other client.
    func testIdsMatchTheWebList() {
        XCTAssertEqual(
            InterestCatalog.all.map(\.id),
            ["food", "music", "sports", "arts", "nightlife", "outdoor", "family", "networking"]
        )
    }

    func testNormalizeLowercasesMapsLegacyDedupesAndKeepsUnknown() {
        XCTAssertEqual(
            InterestCatalog.normalize(["Food", "Business", "food", "kayaking"]),
            ["food", "networking", "kayaking"]
        )
    }

    func testNormalizeDropsBlanksAndHandlesNil() {
        XCTAssertEqual(InterestCatalog.normalize(["  Music ", "", "   "]), ["music"])
        XCTAssertEqual(InterestCatalog.normalize(nil), [])
    }

    func testLabelForUnknownIdIsTheIdItself() {
        XCTAssertEqual(InterestCatalog.label(for: "kayaking"), "kayaking")
        XCTAssertEqual(InterestCatalog.label(for: "music"), "Music & Concerts")
    }

    // MARK: - Rerank

    private func row(_ title: String, _ category: String, reason: String? = nil) -> ForYouService.Recommendation {
        ForYouService.Recommendation(
            id: UUID(),
            title: title,
            date: nil,
            category: category,
            imageUrl: nil,
            venue: nil,
            isFeatured: nil,
            recommendationScore: nil,
            recommendationReason: reason
        )
    }

    func testRerankMovesMatchesFirstStably() {
        let rows = [row("A", "Sports"), row("B", "Music"), row("C", "Food"), row("D", "Music")]
        let result = InterestCatalog.rerank(rows, interestIds: ["music"])

        XCTAssertEqual(result.map(\.title), ["B", "D", "A", "C"])
        XCTAssertEqual(result[0].recommendationReason, "Because you like Music")
        XCTAssertEqual(result[1].recommendationReason, "Because you like Music")
        XCTAssertNil(result[2].recommendationReason)
        XCTAssertNil(result[3].recommendationReason)
    }

    func testRerankKeepsAnExistingReason() {
        let rows = [row("A", "Sports"), row("B", "Music", reason: "Popular this week")]
        let result = InterestCatalog.rerank(rows, interestIds: ["music"])

        XCTAssertEqual(result.map(\.title), ["B", "A"])
        XCTAssertEqual(result[0].recommendationReason, "Popular this week")
    }

    func testRerankWithNoInterestsIsANoOp() {
        let rows = [row("A", "Sports"), row("B", "Music")]
        XCTAssertEqual(InterestCatalog.rerank(rows, interestIds: []).map(\.title), ["A", "B"])
        XCTAssertEqual(InterestCatalog.rerank(rows, interestIds: ["kayaking"]).map(\.title), ["A", "B"])
    }
}
