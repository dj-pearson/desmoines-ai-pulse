import XCTest
@testable import DesMoinesInsider

/// IOS-DD-ACCOUNT-04: which interests drive the For You rerank.
@MainActor
final class InterestPreferencesTests: XCTestCase {
    private static let suiteName = "InterestPreferencesTests"
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: Self.suiteName)
        defaults.removePersistentDomain(forName: Self.suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: Self.suiteName)
        super.tearDown()
    }

    private func profile(interests: [String]?) -> UserProfile {
        var p = UserProfile.preview
        p.interests = interests
        return p
    }

    func testLocalIsStoredNormalized() {
        let prefs = InterestPreferences(defaults: defaults)
        prefs.local = ["Music", "Business"]
        XCTAssertEqual(prefs.local, ["music", "networking"])
    }

    func testProfileInterestsWinWhenPresent() {
        let prefs = InterestPreferences(defaults: defaults)
        prefs.local = ["music"]
        XCTAssertEqual(prefs.effectiveInterests(profile: profile(interests: ["Food"])), ["food"])
    }

    func testLocalIsUsedWhenTheProfileHasNone() {
        let prefs = InterestPreferences(defaults: defaults)
        prefs.local = ["music"]
        XCTAssertEqual(prefs.effectiveInterests(profile: profile(interests: [])), ["music"])
        XCTAssertEqual(prefs.effectiveInterests(profile: profile(interests: nil)), ["music"])
        XCTAssertEqual(prefs.effectiveInterests(profile: nil), ["music"])
    }
}
