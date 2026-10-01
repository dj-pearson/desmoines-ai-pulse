import XCTest
@testable import DesMoinesInsider

/// IOS-DD-PLATFORM-19: the register-device-token body. A register omits
/// `action` so an older function sees the shape it always did.
@MainActor
final class PushTokenPayloadTests: XCTestCase {

    private func json(_ payload: PushNotificationService.TokenPayload) throws -> [String: Any] {
        let data = try JSONEncoder().encode(payload)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    func testUnregisterSendsTheAction() throws {
        let body = try json(.init(deviceToken: "abc", platform: "ios", action: "unregister"))
        XCTAssertEqual(body["action"] as? String, "unregister")
        XCTAssertEqual(body["deviceToken"] as? String, "abc")
    }

    func testRegisterOmitsTheAction() throws {
        let body = try json(.init(deviceToken: "abc", platform: "ios"))
        XCTAssertNil(body["action"])
        XCTAssertEqual(body["platform"] as? String, "ios")
    }
}
