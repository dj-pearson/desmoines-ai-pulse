import XCTest
@testable import DesMoinesInsider

/// IOS-DD-ACCOUNT-09: a cleared field must reach the server as null. The
/// synthesized Encodable left nil keys out of the PATCH, so the old value
/// stayed while the app reported success.
@MainActor
final class ProfileUpdateEncodingTests: XCTestCase {
    func testNilFieldsEncodeAsNullAndEmptyInterestsAsArray() throws {
        let update = ProfileUpdate(first_name: nil, last_name: "X", phone: nil, location: nil, interests: [])
        let data = try JSONEncoder().encode(update)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(Set(object.keys), ["first_name", "last_name", "phone", "location", "interests"])
        XCTAssertTrue(object["phone"] is NSNull)
        XCTAssertTrue(object["first_name"] is NSNull)
        XCTAssertTrue(object["location"] is NSNull)
        XCTAssertEqual(object["last_name"] as? String, "X")
        XCTAssertEqual(object["interests"] as? [String], [])
    }

    func testNilIfBlankTrims() {
        XCTAssertNil(ProfileViewModel.nilIfBlank("   "))
        XCTAssertEqual(ProfileViewModel.nilIfBlank(" Ada "), "Ada")
    }
}
