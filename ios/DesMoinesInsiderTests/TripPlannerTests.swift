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
        // Follows the user's 12/24-hour setting (IOS-DD-TRIP-PLANNER-13), so it
        // is compared with the formatter; TripScheduleTests pins "2:30 PM"
        // under en_US.
        XCTAssertEqual(item.startTimeDisplay, TripSchedule.timeDisplay("14:30:00"))
        XCTAssertNotNil(item.startTimeDisplay)
    }

    // MARK: Saved rows keep tips and packing list (IOS-DD-TRIP-PLANNER-17)

    func testBareRowDecodesStoredTipsAndPackingList() throws {
        let json = """
        { "id": "t", "title": "T", "start_date": "2026-10-03", "end_date": "2026-10-04",
          "tips": ["a"], "packing_list": ["b"] }
        """.data(using: .utf8)!
        let plan = try JSONDecoder().decode(TripPlan.self, from: json)
        XCTAssertEqual(plan.tips, ["a"])
        XCTAssertEqual(plan.packingList, ["b"])
    }

    func testNonArrayPackingListDecodesToNil() throws {
        let json = """
        { "id": "t", "title": "T", "start_date": "2026-10-03", "end_date": "2026-10-04",
          "tips": null, "packing_list": {} }
        """.data(using: .utf8)!
        let plan = try JSONDecoder().decode(TripPlan.self, from: json)
        XCTAssertNil(plan.packingList)
        XCTAssertNil(plan.tips)
    }

    // MARK: content_details coordinates (IOS-DD-TRIP-PLANNER-11)

    func testContentDetailsDecodeCoordinates() throws {
        let json = """
        { "item_id": "x", "day_number": 1, "order_index": 0, "item_type": "restaurant",
          "content_details": { "type": "restaurant", "id": "r-1", "name": "Centro", "slug": "centro",
                               "latitude": 41.5868, "longitude": -93.625, "image_url": null } }
        """.data(using: .utf8)!
        let item = try JSONDecoder().decode(TripPlanItem.self, from: json)
        XCTAssertEqual(item.contentDetails?.latitude, 41.5868)
        XCTAssertEqual(item.contentDetails?.longitude, -93.625)
        XCTAssertEqual(item.contentDetails?.slug, "centro")
        XCTAssertEqual(item.contentDetails?.name, "Centro")
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

/// View and routing logic for the planner (IOS-DD-TRIP-PLANNER-04/11/12/15/16).
@MainActor
final class TripPlannerViewLogicTests: XCTestCase {

    private func trip(_ id: String, start: String, end: String, createdAt: String? = nil) throws -> TripPlan {
        let created = createdAt.map { "\"\($0)\"" } ?? "null"
        let json = """
        { "id": "\(id)", "title": "\(id)", "start_date": "\(start)", "end_date": "\(end)", "created_at": \(created) }
        """
        return try JSONDecoder().decode(TripPlan.self, from: Data(json.utf8))
    }

    private func item(_ json: String) throws -> TripPlanItem {
        try JSONDecoder().decode(TripPlanItem.self, from: Data(json.utf8))
    }

    // MARK: Quota line (TP-04)

    func testInsiderQuotaText() {
        XCTAssertEqual(
            TripPlannerView.quotaText(tier: .insider, used: 2, usageUnknown: false),
            "3 of 5 itineraries left this month."
        )
        XCTAssertEqual(
            TripPlannerView.quotaText(tier: .insider, used: 0, usageUnknown: true),
            "Couldn't check this month's allowance."
        )
        XCTAssertEqual(
            TripPlannerView.quotaText(tier: .vip, used: 40, usageUnknown: true),
            "Unlimited itineraries this month."
        )
    }

    // MARK: Upcoming / past (TP-16)

    func testPartition() throws {
        let yesterday = try trip("y", start: "2026-10-01", end: "2026-10-02")
        let today = try trip("t", start: "2026-10-03", end: "2026-10-03")
        let nextWeek = try trip("n", start: "2026-10-10", end: "2026-10-11")
        let older = try trip("o", start: "2026-09-01", end: "2026-09-02")

        let parts = TripPlannerView.partition([nextWeek, older, yesterday, today], today: "2026-10-03")
        XCTAssertEqual(parts.upcoming.map(\.id), ["t", "n"])
        XCTAssertEqual(parts.past.map(\.id), ["y", "o"])
    }

    // MARK: Recovery after a client timeout (TP-15)

    func testRecoveredTripIsTheNewestCreatedAfterTheTap() throws {
        let startedAt = ISO8601DateFormatter().date(from: "2026-10-03T12:00:00Z")!
        let before = try trip("before", start: "2026-10-03", end: "2026-10-04", createdAt: "2026-10-03T11:59:00.123456+00:00")
        let after = try trip("after", start: "2026-10-03", end: "2026-10-04", createdAt: "2026-10-03T12:00:40.5+00:00")
        let newest = try trip("newest", start: "2026-10-03", end: "2026-10-04", createdAt: "2026-10-03T12:01:10.123456+00:00")
        let undated = try trip("undated", start: "2026-10-03", end: "2026-10-04")

        XCTAssertEqual(TripPlannerView.recoveredTrip(from: [before, after, newest, undated], startedAt: startedAt)?.id, "newest")
        XCTAssertNil(TripPlannerView.recoveredTrip(from: [before, undated], startedAt: startedAt))
        // A plan already listed before the tap is never the recovered one,
        // even inside the clock-skew pad.
        XCTAssertEqual(
            TripPlannerView.recoveredTrip(from: [after, newest], startedAt: startedAt, excluding: ["newest"])?.id,
            "after"
        )
    }

    // MARK: Map stops (TP-11)

    func testMapStopsNumberAcrossDaysAndPreferStoredCoordinates() throws {
        let a = try item(#"{"item_id":"a","day_number":1,"order_index":0,"item_type":"restaurant","title":"Centro","location":"1007 Locust St","content_details":{"type":"restaurant","id":"r","latitude":41.585,"longitude":-93.63}}"#)
        let b = try item(#"{"item_id":"b","day_number":1,"order_index":1,"item_type":"custom","title":"Walk","location":"Principal Riverwalk"}"#)
        let c = try item(#"{"item_id":"c","day_number":2,"order_index":0,"item_type":"attraction","title":"Bad pin","content_details":{"type":"attraction","id":"x","latitude":0,"longitude":0}}"#)

        let stops = TripStopLinks.mapStops(from: [a, b, c])
        XCTAssertEqual(stops.map(\.number), [1, 2, 3])
        XCTAssertEqual(stops[0].coordinate?.latitude, 41.585)
        XCTAssertNil(stops[1].coordinate, "custom stop is geocoded from its location")
        XCTAssertEqual(stops[1].location, "Principal Riverwalk")
        XCTAssertNil(stops[2].coordinate, "(0,0) is outside the service area")
    }

    // MARK: Stop routing (TP-12)

    func testDestinationForStop() throws {
        let event = try item(#"{"item_id":"e","item_type":"event","content_details":{"type":"event","id":"ev-1"}}"#)
        let unknown = try item(#"{"item_id":"u","item_type":"custom","content_details":{"type":"hotel","id":"h-1"}}"#)
        let noId = try item(#"{"item_id":"n","item_type":"restaurant","content_details":{"type":"restaurant"}}"#)
        let custom = try item(#"{"item_id":"c","item_type":"custom"}"#)

        XCTAssertEqual(TripStopLinks.destination(for: event), .event(id: "ev-1"))
        XCTAssertNil(TripStopLinks.destination(for: unknown))
        XCTAssertNil(TripStopLinks.destination(for: noId))
        XCTAssertNil(TripStopLinks.destination(for: custom))
    }

    func testDirectionsUseTheStoredCoordinateThenTheAddress() throws {
        let linked = try item(#"{"item_id":"a","item_type":"restaurant","title":"Centro","location":"1007 Locust St","content_details":{"type":"restaurant","id":"r","latitude":41.585,"longitude":-93.63}}"#)
        let custom = try item(#"{"item_id":"b","item_type":"custom","title":"Walk","location":"Principal Riverwalk"}"#)
        let nowhere = try item(#"{"item_id":"c","item_type":"custom","title":"Nap"}"#)

        XCTAssertTrue(TripStopLinks.directionsURL(for: linked, base: "https://maps.apple.com/")?.absoluteString.contains("41.585") ?? false)
        XCTAssertTrue(TripStopLinks.directionsURL(for: custom, base: "https://maps.apple.com/")?.absoluteString.contains("Riverwalk") ?? false)
        XCTAssertNil(TripStopLinks.directionsURL(for: nowhere, base: "https://maps.apple.com/"))
    }

    // MARK: Home card label (TP-19)

    func testHomeCardLabelStartsWithTheVisibleText() {
        XCTAssertEqual(
            TripPlannerHomeCard.accessibilityLabel(isFreeTier: false),
            "Plan your perfect day. Let AI build a Des Moines itinerary"
        )
        XCTAssertTrue(TripPlannerHomeCard.accessibilityLabel(isFreeTier: true).hasSuffix(", Insider feature"))
    }
}
