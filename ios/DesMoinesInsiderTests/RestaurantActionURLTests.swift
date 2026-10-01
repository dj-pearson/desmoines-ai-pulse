import XCTest
import CoreLocation
@testable import DesMoinesInsider

/// IOS-DD-RESTAURANTS-10: tel, Maps and reservation links built from row data.
final class RestaurantActionURLTests: XCTestCase {

    // MARK: - tel:

    func testExtensionBecomesAPause() {
        XCTAssertEqual(Restaurant.dialURL("(515) 555-0123 ext. 204")?.absoluteString, "tel:5155550123,204")
    }

    func testPlainNumbers() {
        XCTAssertEqual(Restaurant.dialURL("515-555-0123")?.absoluteString, "tel:5155550123")
        XCTAssertEqual(Restaurant.dialURL("+1 515 555 0123")?.absoluteString, "tel:+15155550123")
    }

    func testNotANumberIsNotDialled() {
        XCTAssertNil(Restaurant.dialURL("12345"))
        XCTAssertNil(Restaurant.dialURL("*#06#"))
        XCTAssertNil(Restaurant.dialURL(""))
    }

    // MARK: - Directions

    private let base = "https://maps.apple.com/"
    private let coordinate = CLLocationCoordinate2D(latitude: 41.591, longitude: -93.6088)

    private func items(_ url: URL?) -> [URLQueryItem] {
        guard let url, let c = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return [] }
        return c.queryItems ?? []
    }

    func testAnAmpersandInTheNameStaysInTheName() {
        let q = items(Restaurant.directionsURL(name: "A&W", coordinate: coordinate, address: "", base: base))
        XCTAssertEqual(q.filter { $0.name == "daddr" }.count, 1)
        XCTAssertEqual(q.first { $0.name == "q" }?.value, "A&W")
        XCTAssertEqual(q.first { $0.name == "daddr" }?.value, "41.591,-93.6088")
    }

    func testANameCannotInjectAParameter() {
        let q = items(Restaurant.directionsURL(name: "Evil&daddr=1,2", coordinate: coordinate, address: "", base: base))
        XCTAssertEqual(q.filter { $0.name == "daddr" }.count, 1)
        XCTAssertEqual(q.first { $0.name == "q" }?.value, "Evil&daddr=1,2")
    }

    func testAPlusStaysAPlus() {
        let q = items(Restaurant.directionsURL(name: "Bread + Butter", coordinate: coordinate, address: "", base: base))
        XCTAssertEqual(q.first { $0.name == "q" }?.value, "Bread + Butter")
    }

    func testNoCoordinateUsesTheAddress() {
        let q = items(Restaurant.directionsURL(name: "Place", coordinate: nil, address: "300 E Grand Ave, Des Moines", base: base))
        XCTAssertEqual(q.first { $0.name == "daddr" }?.value, "300 E Grand Ave, Des Moines")
    }

    func testNothingToNavigateToIsNil() {
        XCTAssertNil(Restaurant.directionsURL(name: "Place", coordinate: nil, address: "  ", base: base))
    }

    // MARK: - Reserve

    func testReserveURLPrefersTheCuratedLink() {
        var r = Restaurant(id: "r1", name: "Place")
        r.reservationUrl = "https://resy.com/cities/dsm/place"
        r.reservationProvider = "resy"
        r.googleMapsUri = "https://maps.google.com/?cid=1"
        r.reservable = true
        XCTAssertEqual(r.reserveURL?.host, "resy.com")
        XCTAssertEqual(r.reserveLabel, "Reserve on Resy")
    }

    func testGoogleListingOnlyWhenReservable() {
        var r = Restaurant(id: "r1", name: "Place")
        r.googleMapsUri = "https://maps.google.com/?cid=1"
        XCTAssertNil(r.reserveURL, "nil reservable is unknown, not yes")
        r.reservable = true
        XCTAssertEqual(r.reserveURL?.host, "maps.google.com")
        XCTAssertEqual(r.reserveLabel, "Reserve")
    }

    func testUnsafeReservationSchemeIsRejected() {
        var r = Restaurant(id: "r1", name: "Place")
        r.reservationUrl = "javascript:alert(1)"
        XCTAssertNil(r.reserveURL)
    }
}
