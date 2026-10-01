import XCTest
@testable import DesMoinesInsider

/// IOS-DD-MAP-09: the popup under a tapped pin.
final class MapPopupModelTests: XCTestCase {

    func testAnUntimedEventSaysTimeTBA() {
        // 00:31:58Z on Sep 30 is the 19:31:58 no-time marker.
        let e = Event(id: "u", title: "Untimed", date: "2026-09-30T00:31:58Z")
        let model = MapPopupModel.make(event: e, distanceText: nil, now: MapFixtures.central(2026, 9, 1, 12))
        XCTAssertTrue(model.subtitle.contains("Time TBA"), model.subtitle)
        XCTAssertFalse(model.subtitle.contains("7:31"), model.subtitle)
    }

    func testAnEventOnNowLeadsWithHappeningNow() {
        let now = MapFixtures.central(2026, 9, 29, 20)
        let e = MapFixtures.event("e", start: MapFixtures.central(2026, 9, 29, 19))
        XCTAssertTrue(MapPopupModel.make(event: e, distanceText: nil, now: now).subtitle.hasPrefix("Happening now"))
    }

    func testAPermanentlyClosedRestaurantSaysSoAndOffersNoCall() {
        var r = MapFixtures.restaurant("r", businessStatus: "CLOSED_PERMANENTLY")
        r.phone = "515-555-0100"
        let model = MapPopupModel.make(restaurant: r, distanceText: nil)
        XCTAssertEqual(model.subtitle, "Permanently closed")
        XCTAssertNil(model.secondaryAction)
    }

    func testARestaurantWithAPhoneOffersCall() {
        var r = MapFixtures.restaurant("r")
        r.phone = "515-555-0100"
        XCTAssertEqual(MapPopupModel.make(restaurant: r, distanceText: nil).secondaryAction?.title, "Call")
    }

    func testAttractionDirectionsCarryTheCoordinateAndAnEscapedName() throws {
        let a = MapFixtures.attraction("a", name: "A&W", lat: 41.5868, lng: -93.625)
        let url = try XCTUnwrap(MapPopupModel.make(attraction: a, distanceText: nil).directionsURL)
        XCTAssertTrue(url.absoluteString.contains("daddr=41.5868,-93.625"), url.absoluteString)
        XCTAssertTrue(url.absoluteString.contains("A%26W"), url.absoluteString)
    }

    func testAnExpiredSponsorshipIsNotLabelled() {
        var e = MapFixtures.event("e", start: Date())
        e.isSponsored = true
        e.sponsoredUntil = "2020-01-01T00:00:00Z"
        XCTAssertFalse(MapPopupModel.make(event: e, distanceText: nil).isSponsored)
        e.sponsoredUntil = nil
        XCTAssertTrue(MapPopupModel.make(event: e, distanceText: nil).isSponsored)
    }

    func testEveryKindOpensItsOwnDestination() {
        let r = MapFixtures.restaurant("r")
        XCTAssertEqual(MapPopupModel.make(for: .restaurant(r), distanceText: "0.3 mi").destination, .restaurant(r))
        XCTAssertEqual(MapPopupModel.make(for: .restaurant(r), distanceText: "0.3 mi").distanceText, "0.3 mi")
    }
}
