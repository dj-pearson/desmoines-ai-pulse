import XCTest
@testable import DesMoinesInsider

/// Pure-logic coverage for IOS-PARITY-005. The networked casting flow + SwiftUI
/// screens run in the CI macOS build; these lock the decode contract (shared
/// with the web voting_categories/votes tables), the vote aggregation/ranking,
/// and the category icon mapping.
final class VotingTests: XCTestCase {

    // MARK: Decoding

    func testCategoryDecodesAndDefaultsVoteCount() throws {
        let json = """
        {
          "id": "c1", "name": "Best Pizza", "slug": "best-pizza",
          "description": "Vote for the best pizza", "icon": "pizza",
          "is_active": true, "voting_start": "2026-01-01T00:00:00Z",
          "voting_end": null, "created_at": "2026-01-01T00:00:00Z"
        }
        """.data(using: .utf8)!
        let category = try JSONDecoder().decode(VotingCategory.self, from: json)
        XCTAssertEqual(category.slug, "best-pizza")
        XCTAssertEqual(category.voteCount, 0) // not a column — defaults
        XCTAssertEqual(category.systemImage, "fork.knife") // pizza → SF Symbol
        XCTAssertTrue(category.isVotingOpen)
    }

    func testCategoryVotingClosedWhenEnded() throws {
        let json = """
        { "id": "c2", "name": "Old Award", "slug": "old", "icon": "trophy",
          "is_active": true, "voting_end": "2020-01-01T00:00:00Z" }
        """.data(using: .utf8)!
        let category = try JSONDecoder().decode(VotingCategory.self, from: json)
        XCTAssertFalse(category.isVotingOpen)
        XCTAssertEqual(category.systemImage, "trophy.fill")
    }

    func testVoteDecodesAndResultKey() throws {
        let json = """
        { "id": "v1", "category_id": "c1", "entity_type": "restaurant",
          "entity_id": "r-9", "custom_entry": null, "user_id": "u-1",
          "created_at": "2026-06-01T00:00:00Z" }
        """.data(using: .utf8)!
        let vote = try JSONDecoder().decode(Vote.self, from: json)
        XCTAssertEqual(vote.resultKey, "r-9")

        let customVote = Vote(id: "v2", categoryId: "c1", entityType: "custom",
                              entityId: nil, customEntry: "Tony's", userId: "u-1", createdAt: nil)
        XCTAssertEqual(customVote.resultKey, "Tony's")
    }

    // MARK: Aggregation / ranking

    func testAggregateRanksByVoteCountDescending() {
        let rows: [VoteResult.Raw] = [
            .init(entityType: "restaurant", entityId: "a", customEntry: nil),
            .init(entityType: "restaurant", entityId: "b", customEntry: nil),
            .init(entityType: "restaurant", entityId: "a", customEntry: nil),
            .init(entityType: "restaurant", entityId: "a", customEntry: nil),
            .init(entityType: "custom", entityId: nil, customEntry: "Write-in"),
            .init(entityType: "restaurant", entityId: "b", customEntry: nil),
        ]
        let results = VoteResult.aggregate(rows)
        XCTAssertEqual(results.count, 3)
        XCTAssertEqual(results[0].entityId, "a")      // 3 votes
        XCTAssertEqual(results[0].voteCount, 3)
        XCTAssertEqual(results[1].entityId, "b")      // 2 votes
        XCTAssertEqual(results[1].voteCount, 2)
        XCTAssertEqual(results[2].customEntry, "Write-in") // 1 vote
        XCTAssertEqual(results[2].voteCount, 1)
    }

    func testAggregateEmptyIsEmpty() {
        XCTAssertTrue(VoteResult.aggregate([]).isEmpty)
    }

    // MARK: Result display

    func testVoteResultDisplayNameFallsBackToCustomEntry() {
        let r = VoteResult(entityType: "custom", entityId: nil, customEntry: "Tony's", voteCount: 1)
        XCTAssertEqual(r.displayName, "Tony's")
        XCTAssertEqual(r.id, "Tony's")
        XCTAssertEqual(r.placeholderEmoji, "✏️")

        let named = VoteResult(entityType: "restaurant", entityId: "r1", customEntry: nil, voteCount: 5, name: "Centro")
        XCTAssertEqual(named.displayName, "Centro")
        XCTAssertEqual(named.id, "r1")
        XCTAssertEqual(named.placeholderEmoji, "🍽️")
    }

    // MARK: Winners cache

    func testWinnersCacheRoundTrips() {
        BestOfWinners.shared.update(["r-1": "Best Pizza", "a-2": "Best Hidden Gem"])
        XCTAssertEqual(BestOfWinners.shared.winnerLabel(forEntityId: "r-1"), "Best Pizza")
        XCTAssertEqual(BestOfWinners.shared.winnerLabel(forEntityId: "a-2"), "Best Hidden Gem")
        XCTAssertNil(BestOfWinners.shared.winnerLabel(forEntityId: "nope"))
        BestOfWinners.shared.update([:]) // reset for other tests
    }
}
