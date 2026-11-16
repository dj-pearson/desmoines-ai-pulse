import XCTest
@testable import DesMoinesInsider

/// WEB-LEGAL-012: the iOS "Account and activity emails" switch reads
/// communication_preferences.email_notifications the way the senders do
/// (absence is consent, only JSON false opts out) and writes it back without
/// dropping the bag's other keys.
final class AccountEmailPreferenceTests: XCTestCase {
    private typealias Service = AccountEmailPreferenceService

    private func bag(_ json: String) throws -> [String: Any] {
        try XCTUnwrap(PersonalizationPreferenceService.bag(from: Data(json.utf8)))
    }

    func testOnlyJSONFalseOptsOut() throws {
        XCTAssertFalse(Service.isOptedIn(try bag(#"[{"communication_preferences":{"email_notifications":false}}]"#)))
        XCTAssertTrue(Service.isOptedIn(try bag(#"[{"communication_preferences":{"email_notifications":true}}]"#)))
        // The senders test `!== false`, so each of these still gets mail.
        XCTAssertTrue(Service.isOptedIn(try bag(#"[{"communication_preferences":{"email_notifications":"false"}}]"#)))
        XCTAssertTrue(Service.isOptedIn(try bag(#"[{"communication_preferences":{"email_notifications":0}}]"#)))
        XCTAssertTrue(Service.isOptedIn(try bag(#"[{"communication_preferences":{"email_notifications":null}}]"#)))
        XCTAssertTrue(Service.isOptedIn(try bag(#"[{"communication_preferences":{}}]"#)))
        XCTAssertTrue(Service.isOptedIn(try bag(#"[{"communication_preferences":null}]"#)))
    }

    func testPatchKeepsOtherKeys() throws {
        let existing = try bag(
            #"[{"communication_preferences":{"event_recommendations":true,"taste_preferences":{"a":1}}}]"#
        )
        let body = try Service.patchBody(merging: false, into: existing)
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(Array(root.keys), ["communication_preferences"])
        let merged = try XCTUnwrap(root["communication_preferences"] as? [String: Any])
        XCTAssertEqual(merged["event_recommendations"] as? Bool, true)
        XCTAssertNotNil(merged["taste_preferences"] as? [String: Any])
        XCTAssertFalse(Service.isOptedIn(merged))
    }

    func testPatchOffWritesExplicitFalse() throws {
        let body = try Service.patchBody(merging: false, into: [:])
        XCTAssertEqual(String(decoding: body, as: UTF8.self),
                       #"{"communication_preferences":{"email_notifications":false}}"#)
    }
}
