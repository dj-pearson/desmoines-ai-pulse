import XCTest
@testable import DesMoinesInsider

/// XPLAT-016: the iOS "Personalized Suggestions" switch reads
/// communication_preferences.event_recommendations as opt-in and writes it
/// back without dropping the bag's other keys.
final class PersonalizationPreferenceTests: XCTestCase {
    private typealias Service = PersonalizationPreferenceService

    private func bag(_ json: String) -> [String: Any]? {
        Service.bag(from: Data(json.utf8))
    }

    func testOnlyJSONTrueIsOn() {
        XCTAssertTrue(Service.isOn(bag(#"[{"communication_preferences":{"event_recommendations":true}}]"#)))
        XCTAssertFalse(Service.isOn(bag(#"[{"communication_preferences":{"event_recommendations":false}}]"#)))
        XCTAssertFalse(Service.isOn(bag(#"[{"communication_preferences":{"event_recommendations":"true"}}]"#)))
        XCTAssertFalse(Service.isOn(bag(#"[{"communication_preferences":{"event_recommendations":1}}]"#)))
        XCTAssertFalse(Service.isOn(bag(#"[{"communication_preferences":{"event_recommendations":null}}]"#)))
        XCTAssertFalse(Service.isOn(bag(#"[{"communication_preferences":{}}]"#)))
    }

    func testNullOrMissingColumnIsAnEmptyBag() {
        XCTAssertEqual(bag(#"[{"communication_preferences":null}]"#)?.count, 0)
        XCTAssertEqual(bag(#"[{}]"#)?.count, 0)
        XCTAssertFalse(Service.isOn(bag(#"[{"communication_preferences":null}]"#)))
    }

    /// No row, garbage, or a non-object column must stop a write: writing a
    /// bag we could not read would erase the keys the web set.
    func testUnreadableResponseIsNil() {
        XCTAssertNil(bag("[]"))
        XCTAssertNil(bag("oops"))
        XCTAssertNil(bag(#"[{"communication_preferences":"x"}]"#))
        XCTAssertFalse(Service.isOn(nil))
    }

    func testPatchKeepsOtherKeys() throws {
        let existing = try XCTUnwrap(bag(
            #"[{"communication_preferences":{"email_notifications":false,"event_recommendations":false,"sms":true}}]"#
        ))
        let body = try Service.patchBody(merging: true, into: existing)
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(Array(root.keys), ["communication_preferences"])
        let merged = try XCTUnwrap(root["communication_preferences"] as? [String: Any])
        XCTAssertEqual(merged["email_notifications"] as? Bool, false)
        XCTAssertEqual(merged["sms"] as? Bool, true)
        XCTAssertTrue(Service.isOn(merged))
    }

    func testPatchOffWritesExplicitFalse() throws {
        let body = try Service.patchBody(merging: false, into: [:])
        XCTAssertEqual(String(decoding: body, as: UTF8.self),
                       #"{"communication_preferences":{"event_recommendations":false}}"#)
    }
}
