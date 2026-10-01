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

    // MARK: Voting window (IOS-DD-GUIDES-07)

    private func category(
        id: String = "c1", start: String? = nil, end: String? = nil, active: Bool? = true
    ) -> VotingCategory {
        VotingCategory(
            id: id, name: "Best Pizza", slug: "best-pizza", description: nil, icon: "pizza",
            isActive: active, votingStart: start, votingEnd: end, createdAt: nil
        )
    }

    private let now = ISO8601DateFormatter().date(from: "2026-06-15T12:00:00Z")!

    func testVotingNotOpenBeforeStart() {
        let c = category(start: "2026-07-01T00:00:00Z")
        XCTAssertFalse(c.isVotingOpen(at: now))
    }

    func testVotingOpenWithinWindow() {
        let c = category(start: "2026-06-01T00:00:00Z", end: "2026-06-30T00:00:00Z")
        XCTAssertTrue(c.isVotingOpen(at: now))
        XCTAssertNotNil(c.closesAt)
        XCTAssertFalse(category(end: "2026-06-01T00:00:00Z").isVotingOpen(at: now))
        XCTAssertFalse(category(active: false).isVotingOpen(at: now))
    }

    // MARK: Vote failures (IOS-DD-GUIDES-06/07)

    func testFailureMessage42501WithEarlierVote() {
        XCTAssertEqual(
            BestOfCategoryViewModel.failureMessage(for: "new row violates row-level security policy", code: "42501", hadEarlierVote: true),
            "We couldn't change your vote. Your earlier vote still counts."
        )
    }

    func testFailureMessage42501WithoutEarlierVote() {
        XCTAssertEqual(
            BestOfCategoryViewModel.failureMessage(for: nil, code: "42501", hadEarlierVote: false),
            "We couldn't save your vote. Please try again later."
        )
    }

    func testFailureMessageMapsGuardErrors() {
        XCTAssertEqual(
            BestOfCategoryViewModel.failureMessage(for: "voting_closed", code: "P0001", hadEarlierVote: false),
            "Voting in this category has closed."
        )
        XCTAssertEqual(
            BestOfCategoryViewModel.failureMessage(for: "invalid_write_in", code: "P0001", hadEarlierVote: false),
            "That write-in can't be used. Try searching for the place instead."
        )
        XCTAssertEqual(
            BestOfCategoryViewModel.failureMessage(for: "unknown_entity", code: "P0001", hadEarlierVote: true),
            "That place is no longer listed."
        )
        XCTAssertEqual(
            BestOfCategoryViewModel.failureMessage(for: "timeout", code: nil, hadEarlierVote: false),
            "Couldn't record your vote. Please try again."
        )
    }

    // MARK: Leaderboard cap (IOS-DD-GUIDES-09)

    private func results(_ n: Int) -> [VoteResult] {
        (0..<n).map { VoteResult(entityType: "custom", entityId: nil, customEntry: "Place \($0)", voteCount: n - $0) }
    }

    func testVisibleResultsCapAtTen() {
        XCTAssertEqual(VoteResult.visible(results(14), showAll: false).count, 10)
        XCTAssertEqual(VoteResult.visible(results(4), showAll: false).count, 4)
    }

    func testVisibleResultsShowAll() {
        XCTAssertEqual(VoteResult.visible(results(14), showAll: true).count, 14)
    }

    func testCategorySubjectName() {
        XCTAssertEqual(category().subjectName, "pizza")
    }

    // MARK: Ballot progress (IOS-DD-GUIDES-10)

    func testBallotProgressCountsOnlyOpenCategories() {
        let cats = [
            category(id: "a"),
            category(id: "b"),
            category(id: "closed", end: "2026-01-01T00:00:00Z"),
            category(id: "later", start: "2026-12-01T00:00:00Z"),
        ]
        let progress = BestOfViewModel.progress(categories: cats, voted: ["a", "closed"], now: now)
        XCTAssertEqual(progress.voted, 1)
        XCTAssertEqual(progress.total, 2)
    }
}
