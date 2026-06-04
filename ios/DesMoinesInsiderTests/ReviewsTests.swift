import XCTest
@testable import DesMoinesInsider

/// Pure-logic coverage for IOS-PARITY-009. The networked write flow + SwiftUI
/// composer run in CI; these lock the user_ratings decode contract (incl. the
/// joined author profile) and the display helpers.
final class ReviewsTests: XCTestCase {

    func testRatingDecodesWithAuthorProfile() throws {
        let json = """
        {
          "id": "r1", "content_id": "rest-9", "content_type": "restaurant",
          "user_id": "u1", "rating": "4", "review_text": "Great patio!",
          "is_verified": true, "created_at": "2026-05-01T12:00:00Z",
          "updated_at": "2026-05-02T12:00:00Z",
          "profiles": { "first_name": "Dana", "last_name": "M" }
        }
        """.data(using: .utf8)!
        let rating = try JSONDecoder().decode(UserRating.self, from: json)
        XCTAssertEqual(rating.ratingValue, 4)
        XCTAssertEqual(rating.authorName, "Dana M")
        XCTAssertEqual(rating.contentType, "restaurant")
        XCTAssertNotNil(rating.formattedDate)
    }

    func testRatingDecodesWithoutProfileFallsBackName() throws {
        let json = """
        {
          "id": "r2", "content_id": "e-1", "content_type": "event",
          "user_id": "u2", "rating": "5", "review_text": null,
          "created_at": "2026-05-01T12:00:00Z", "updated_at": "2026-05-01T12:00:00Z"
        }
        """.data(using: .utf8)!
        let rating = try JSONDecoder().decode(UserRating.self, from: json)
        XCTAssertEqual(rating.ratingValue, 5)
        XCTAssertEqual(rating.authorName, "Des Moines Insider") // no profile → fallback
        XCTAssertNil(rating.reviewText)
    }

    func testAggregateDecodes() throws {
        let json = """
        { "average_rating": 4.3, "total_ratings": 17 }
        """.data(using: .utf8)!
        let agg = try JSONDecoder().decode(ContentRatingAggregate.self, from: json)
        XCTAssertEqual(agg.averageRating, 4.3)
        XCTAssertEqual(agg.totalRatings, 17)
    }
}
