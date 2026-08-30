import XCTest
@testable import DesMoinesInsider

/// Pure-logic coverage for IOS-PARITY-001. The networked generate/save flow and
/// SwiftUI screens are exercised by the macOS build + UI tests in CI; these lock
/// the decode contract (shared with the web backend) and the quota math.
final class TripPlannerTests: XCTestCase {

    // MARK: Decoding — generate-itinerary response shape

    func testTripPlanDecodesGenerateResponseShape() throws {
        let json = """
        {
          "id": "trip-1",
          "user_id": "u-1",
          "title": "A Perfect Des Moines Weekend",
          "description": "Two days of food and music",
          "start_date": "2026-06-06",
          "end_date": "2026-06-07",
          "status": "draft",
          "is_public": false,
          "share_code": "ABC123",
          "ai_generated": true,
          "total_estimated_cost": "$120-180",
          "created_at": "2026-06-04T12:00:00Z",
          "tips": ["Park downtown", "Bring a jacket"],
          "packingList": ["Comfortable shoes"],
          "items": [
            {
              "item_id": "i-1",
              "day_number": 1,
              "order_index": 0,
              "item_type": "restaurant",
              "title": "Centro",
              "description": "Italian",
              "location": "Locust St",
              "start_time": "14:30:00",
              "end_time": "16:00:00",
              "duration_minutes": 90,
              "notes": null,
              "estimated_cost": "$$",
              "booking_url": null,
              "is_confirmed": false,
              "ai_suggested": true,
              "ai_reason": "Great for your food interest",
              "content_details": { "type": "restaurant", "id": "r-9", "image_url": null }
            }
          ]
        }
        """.data(using: .utf8)!

        let plan = try JSONDecoder().decode(TripPlan.self, from: json)
        XCTAssertEqual(plan.id, "trip-1")
        XCTAssertEqual(plan.shareCode, "ABC123")
        XCTAssertEqual(plan.items?.count, 1)
        XCTAssertEqual(plan.tips?.count, 2)
        XCTAssertEqual(plan.packingList, ["Comfortable shoes"])

        let item = try XCTUnwrap(plan.items?.first)
        XCTAssertEqual(item.itemType, "restaurant")
        XCTAssertEqual(item.dayNumber, 1)
        XCTAssertEqual(item.contentDetails?.type, "restaurant")
        XCTAssertEqual(item.systemImage, "fork.knife")
    }

    func testTripPlanDecodesBareListRowWithoutItems() throws {
        // fetchTrips() returns rows with no items/tips/packingList — must decode.
        let json = """
        {
          "id": "trip-2", "title": "Solo day", "description": null,
          "start_date": "2026-07-01", "end_date": "2026-07-01",
          "status": "draft", "is_public": false, "share_code": null,
          "ai_generated": true, "total_estimated_cost": null,
          "created_at": "2026-06-04T12:00:00Z"
        }
        """.data(using: .utf8)!
        let plan = try JSONDecoder().decode(TripPlan.self, from: json)
        XCTAssertNil(plan.items)
        XCTAssertNil(plan.tips)
    }

    // MARK: Formatting

    func testStartTimeDisplayFormats24HourTime() throws {
        let json = """
        { "item_id": "x", "day_number": 1, "order_index": 0, "item_type": "event",
          "start_time": "14:30:00", "is_confirmed": false, "ai_suggested": true }
        """.data(using: .utf8)!
        let item = try JSONDecoder().decode(TripPlanItem.self, from: json)
        XCTAssertEqual(item.startTimeDisplay, "2:30 PM")
    }

    // MARK: Quota math (IOS-SUB-011 → IOS-PARITY-001)

    func testTripPlanQuotaLimitsPerTier() {
        let action = PremiumFeature.QuotaAction.tripPlans
        XCTAssertEqual(action.limit(for: .free), 0)
        XCTAssertEqual(action.limit(for: .insider), 5)
        XCTAssertEqual(action.limit(for: .vip), -1)

        XCTAssertFalse(action.isWithinLimit(0, for: .free))
        XCTAssertTrue(action.isWithinLimit(4, for: .insider))
        XCTAssertFalse(action.isWithinLimit(5, for: .insider))
        XCTAssertTrue(action.isWithinLimit(999, for: .vip)) // unlimited

        XCTAssertEqual(action.remaining(2, for: .insider), 3)
        XCTAssertNil(action.remaining(2, for: .vip))
    }
}
