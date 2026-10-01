import XCTest
@testable import DesMoinesInsider

/// IOS-DD-BROWSE-09 / 11: the attraction columns past the original thirteen,
/// sponsorship disclosure, directions and the share link.
final class AttractionModelTests: XCTestCase {

    private func decode(_ json: String) throws -> Attraction {
        try JSONDecoder().decode(Attraction.self, from: Data(json.utf8))
    }

    private func attraction(_ fields: String = "") throws -> Attraction {
        let extra = fields.isEmpty ? "" : ",\(fields)"
        return try decode(#"{"id":"a1","name":"Blank Park Zoo","type":"Zoo""# + extra + "}")
    }

    private var future: String { DateParser.toISO(Date().addingTimeInterval(86_400)) }
    private var past: String { DateParser.toISO(Date().addingTimeInterval(-86_400)) }

    // MARK: Decoding

    func testFullRowDecodesEveryNewColumn() throws {
        let a = try attraction(#"""
        "address":"7401 SW 9th St, Des Moines","hours_summary":"Daily 9-5",
        "hours":{"sat":{"open":"09:00","close":"17:00"}},
        "is_indoor":false,"is_kid_friendly":true,"is_free":false,"is_active":true,
        "accessibility_notes":"Paved paths","geo_summary":"A zoo on the south side.",
        "slug":"blank-park-zoo","is_sponsored":true,"sponsored_until":"2099-01-01T00:00:00Z"
        """#)
        XCTAssertEqual(a.address, "7401 SW 9th St, Des Moines")
        XCTAssertEqual(a.hoursSummary, "Daily 9-5")
        XCTAssertEqual(a.hours?.value(for: "sat"), .open(open: "09:00", close: "17:00"))
        XCTAssertEqual(a.isIndoor, false)
        XCTAssertEqual(a.isKidFriendly, true)
        XCTAssertEqual(a.isFree, false)
        XCTAssertEqual(a.isActive, true)
        XCTAssertEqual(a.accessibilityNotes, "Paved paths")
        XCTAssertEqual(a.geoSummary, "A zoo on the south side.")
        XCTAssertEqual(a.slug, "blank-park-zoo")
        XCTAssertEqual(a.isSponsored, true)
        XCTAssertEqual(a.sponsoredUntil, "2099-01-01T00:00:00Z")
    }

    func testLegacyRowLeavesNewColumnsNil() throws {
        let a = try attraction()
        XCTAssertNil(a.address)
        XCTAssertNil(a.hoursSummary)
        XCTAssertNil(a.hours)
        XCTAssertNil(a.isIndoor)
        XCTAssertNil(a.isKidFriendly)
        XCTAssertNil(a.isFree)
        XCTAssertNil(a.isActive)
        XCTAssertNil(a.accessibilityNotes)
        XCTAssertNil(a.geoSummary)
        XCTAssertNil(a.slug)
        XCTAssertNil(a.isSponsored)
        XCTAssertNil(a.sponsoredUntil)
    }

    func testMalformedHoursDecodeAsNilNotAFailedRow() throws {
        let a = try attraction(#""hours":"9-5""#)
        XCTAssertNil(a.hours)
        XCTAssertEqual(a.name, "Blank Park Zoo")
    }

    // MARK: Sponsorship

    func testSponsorshipHonoursSponsoredUntil() throws {
        let live = try attraction(#""is_sponsored":true,"sponsored_until":"\#(future)""#)
        let lapsed = try attraction(#""is_sponsored":true,"sponsored_until":"\#(past)""#)
        XCTAssertTrue(live.isActivelySponsored)
        XCTAssertFalse(lapsed.isActivelySponsored)
        XCTAssertTrue(live.cardData.isSponsored)
        XCTAssertFalse(lapsed.cardData.isSponsored)
    }

    func testRailLabelLeadsWithSponsoredOnlyWhenLive() throws {
        let live = try attraction(#""is_sponsored":true,"sponsored_until":"\#(future)""#)
        let lapsed = try attraction(#""is_sponsored":true,"sponsored_until":"\#(past)""#)
        XCTAssertTrue(live.railAccessibilityLabel.hasPrefix("Sponsored. "))
        XCTAssertFalse(lapsed.railAccessibilityLabel.hasPrefix("Sponsored. "))
    }

    func testUnknownTypeShowsTheStoredText() throws {
        let a = try decode(#"{"id":"a2","name":"Art Park","type":"Park/Art"}"#)
        XCTAssertEqual(a.cardData.metaPrimary?.text, "Park/Art")
    }

    func testFreePillOnlyWhenTheRowSaysFree() throws {
        XCTAssertTrue(try attraction(#""is_free":true"#).cardData.pills.contains { $0.text == "Free" })
        XCTAssertFalse(try attraction(#""is_free":false"#).cardData.pills.contains { $0.text == "Free" })
        XCTAssertFalse(try attraction().cardData.pills.contains { $0.text == "Free" })
    }

    // MARK: Directions

    private func queryItems(_ url: URL?) -> [URLQueryItem] {
        guard let url, let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems else { return [] }
        return items
    }

    func testDirectionsKeepAnAmpersandInsideTheName() throws {
        let a = try decode(#"{"id":"a3","name":"Science Center of Iowa & Blank IMAX","type":"Museum","latitude":41.58,"longitude":-93.62}"#)
        let items = queryItems(a.directionsURL)
        XCTAssertEqual(items.filter { $0.name == "daddr" }.count, 1)
        XCTAssertEqual(items.first { $0.name == "q" }?.value, "Science Center of Iowa & Blank IMAX")
    }

    func testDirectionsFallBackToTheAddress() throws {
        let a = try attraction(#""address":"401 W MLK Jr Pkwy, Des Moines""#)
        XCTAssertEqual(queryItems(a.directionsURL).first { $0.name == "daddr" }?.value, "401 W MLK Jr Pkwy, Des Moines")
    }

    func testNoDirectionsWithoutCoordinatesOrAddress() throws {
        XCTAssertNil(try attraction(#""location":"""#).directionsURL)
    }

    // MARK: Share link

    func testShareURLNeedsASlug() throws {
        XCTAssertNil(try attraction().shareURL)
        XCTAssertNil(try attraction(#""slug":"""#).shareURL)
        let url = try attraction(#""slug":"blank-park-zoo""#).shareURL
        XCTAssertTrue(url?.absoluteString.hasSuffix("/attractions/blank-park-zoo") == true)
    }
}
