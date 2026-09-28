import XCTest
@testable import DesMoinesInsider

/// Pure-logic coverage for IOS-PARITY-009. The networked write flow + SwiftUI
/// composer run in CI; these lock the user_ratings decode contract (incl. the
/// short author name) and the display helpers.
final class ReviewsTests: XCTestCase {

    func testRatingDecodesModerationStatus() throws {
        let json = """
        {
          "id": "r1", "content_id": "rest-9", "content_type": "restaurant",
          "user_id": "u1", "rating": "4", "review_text": "Great patio!",
          "moderation_status": "pending",
          "created_at": "2026-05-01T12:00:00Z", "updated_at": "2026-05-02T12:00:00Z"
        }
        """.data(using: .utf8)!
        let rating = try JSONDecoder().decode(UserRating.self, from: json)
        XCTAssertEqual(rating.ratingValue, 4)
        XCTAssertEqual(rating.moderationStatus, "pending")
        XCTAssertEqual(rating.contentType, "restaurant")
        XCTAssertNotNil(rating.formattedDate)
    }

    // MARK: - Author names (IOS-DD-GUIDES-02)

    func testRatingWithoutDisplayNameIsLocalReviewer() throws {
        let json = """
        {
          "id": "r2", "content_id": "e-1", "content_type": "event",
          "user_id": "u2", "rating": "5", "review_text": null,
          "created_at": "2026-05-01T12:00:00Z", "updated_at": "2026-05-01T12:00:00Z"
        }
        """.data(using: .utf8)!
        var rating = try JSONDecoder().decode(UserRating.self, from: json)
        XCTAssertEqual(rating.authorName, "Local reviewer")
        XCTAssertNotEqual(rating.authorName, "Des Moines Insider")
        XCTAssertNil(rating.reviewText)
        rating.authorDisplayName = "  "
        XCTAssertEqual(rating.authorName, "Local reviewer")
        rating.authorDisplayName = "Dana M."
        XCTAssertEqual(rating.authorName, "Dana M.")
    }

    func testShortNameUsesLastInitial() {
        XCTAssertEqual(UserRating.shortName(first: "Dana", last: "Morris"), "Dana M.")
        XCTAssertEqual(UserRating.shortName(first: "Dana", last: nil), "Dana")
        XCTAssertNil(UserRating.shortName(first: " ", last: " "))
    }

    // MARK: - Reporting (IOS-DD-GUIDES-03)

    func testReportUsesTheSharedModerationRPC() {
        XCTAssertEqual(RatingsService.reportRPCName, "report_review")
        XCTAssertEqual(RatingsService.reportRPCParam, "p_rating_id")
    }

    func testReportFailureMessageForStaleReview() {
        XCTAssertEqual(
            ReviewsViewModel.reportFailureMessage("review_not_found"),
            "This review is no longer available."
        )
        XCTAssertEqual(
            ReviewsViewModel.reportFailureMessage(nil),
            "Couldn't submit your report. Please try again."
        )
    }

    // MARK: - Header summary (IOS-DD-GUIDES-04)

    private func rating(_ id: String, _ value: Int, status: String?) -> UserRating {
        UserRating(
            id: id, contentId: "c", contentType: "restaurant", userId: "u-\(id)",
            rating: String(value), reviewText: nil, moderationStatus: status,
            createdAt: nil, updatedAt: nil
        )
    }

    func testSummaryUsesAggregateCountWithAggregateAverage() {
        let reviews = [rating("a", 5, status: "approved"), rating("b", 1, status: "pending")]
        let agg = ContentRatingAggregate(averageRating: 4.2, totalRatings: 12)
        let summary = ReviewsViewModel.summary(reviews: reviews, aggregate: agg)
        XCTAssertEqual(summary.average, 4.2)
        XCTAssertEqual(summary.count, 12)
    }

    func testSummaryFallbackIgnoresPendingAndRejected() {
        let reviews = [
            rating("a", 4, status: "approved"),
            rating("b", 2, status: nil),
            rating("c", 1, status: "pending"),
            rating("d", 1, status: "rejected"),
        ]
        let summary = ReviewsViewModel.summary(reviews: reviews, aggregate: nil)
        XCTAssertEqual(summary.count, 2)
        XCTAssertEqual(summary.average ?? 0, 3.0, accuracy: 0.001)

        let onlyPending = ReviewsViewModel.summary(reviews: [rating("c", 1, status: "pending")], aggregate: nil)
        XCTAssertNil(onlyPending.average)
        XCTAssertEqual(onlyPending.count, 0)
    }

    func testAggregateDecodes() throws {
        let json = """
        { "average_rating": 4.3, "total_ratings": 17 }
        """.data(using: .utf8)!
        let agg = try JSONDecoder().decode(ContentRatingAggregate.self, from: json)
        XCTAssertEqual(agg.averageRating, 4.3)
        XCTAssertEqual(agg.totalRatings, 17)
    }

    // MARK: - Moderation state (IOS-DD-EVENTS-16)

    func testABareRatingIsApproved() {
        XCTAssertEqual(RatingsService.moderationStatus(for: nil), "approved")
        XCTAssertEqual(RatingsService.moderationStatus(for: "  "), "approved")
    }

    func testAReviewWithTextWaitsForModeration() {
        XCTAssertEqual(RatingsService.moderationStatus(for: "Great"), "pending")
    }
}
