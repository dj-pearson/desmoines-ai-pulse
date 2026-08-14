import XCTest
@testable import DesMoinesInsider

/// Locks the `version-check` response contract (IOS-AUDIT-REL-001) so the iOS
/// decoder and the edge function can't silently drift apart, and sanity-checks
/// the version string the app reports.
final class VersionCheckTests: XCTestCase {

    func testForceUpgradeResponseDecodes() throws {
        let json = """
        {
          "platform": "ios",
          "currentVersion": "1.0.0",
          "minSupportedVersion": "1.1.0",
          "latestVersion": "1.2.0",
          "forceUpgrade": true,
          "updateAvailable": true,
          "storeUrl": "https://apps.apple.com/app/id123",
          "message": "This version is no longer supported."
        }
        """.data(using: .utf8)!
        let resp = try JSONDecoder().decode(VersionCheckService.Response.self, from: json)
        XCTAssertTrue(resp.forceUpgrade)
        XCTAssertEqual(resp.minSupportedVersion, "1.1.0")
        XCTAssertEqual(resp.storeUrl, "https://apps.apple.com/app/id123")
    }

    func testSupportedResponseDecodes() throws {
        let json = """
        {
          "platform": "ios",
          "currentVersion": "1.2.0",
          "minSupportedVersion": "1.0.0",
          "latestVersion": "1.2.0",
          "forceUpgrade": false,
          "updateAvailable": false,
          "storeUrl": "https://apps.apple.com/app/id123",
          "message": "You're on the latest version."
        }
        """.data(using: .utf8)!
        let resp = try JSONDecoder().decode(VersionCheckService.Response.self, from: json)
        XCTAssertFalse(resp.forceUpgrade)
        // `updateAvailable` is optional on Response — only `forceUpgrade` is
        // required, so this has to compare against the value, not coerce.
        XCTAssertEqual(resp.updateAvailable, false)
    }

    func testAppVersionIsDottedNumeric() {
        // CFBundleShortVersionString should be a dotted numeric the backend can
        // compare; never empty (Config falls back to "1.0.0").
        let version = Config.appVersion
        XCTAssertFalse(version.isEmpty)
        let segments = version.split(separator: ".")
        XCTAssertTrue(segments.allSatisfy { Int($0) != nil }, "Version \(version) must be dotted-numeric")
    }
}
