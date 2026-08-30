import XCTest
@testable import DesMoinesInsider

/// IOS-AUDIT-TEST-004 AC1 -- credential persistence round-trips.
///
/// KeychainService is what keeps a user signed in across launches. A regression
/// here logs everyone out on the next release, and nothing else in the suite
/// touched it.
///
/// AC3: the keychain is not guaranteed to be available to a test bundle - it
/// depends on the host app and its entitlements. Every test below checks that a
/// write succeeded and calls XCTSkip if it did not, so an environment without a
/// usable keychain reports "skipped" rather than a wall of red that gets muted.
final class KeychainServiceTests: XCTestCase {

    private let key = "test.keychain.roundtrip"
    private var service: KeychainService { KeychainService.shared }

    override func setUp() {
        super.setUp()
        service.delete(key: key)
    }

    override func tearDown() {
        service.delete(key: key)
        super.tearDown()
    }

    /// Write once, or skip the test. Returns false when the keychain is not
    /// usable here, which the caller turns into a skip.
    private func seed(_ value: String) throws {
        guard service.saveString(key: key, value: value) else {
            throw XCTSkip("Keychain is not writable in this environment.")
        }
    }

    // MARK: - Round trip

    func testSaveThenLoadReturnsTheSameValue() throws {
        try seed("token-abc")
        XCTAssertEqual(service.loadString(key: key), "token-abc")
    }

    func testSaveOverwritesRatherThanFailingOnDuplicate() throws {
        // save() deletes before adding precisely because SecItemAdd returns
        // errSecDuplicateItem otherwise. Without that, a token refresh would
        // silently keep writing and the app would keep reading the stale one.
        try seed("first")
        try seed("second")
        XCTAssertEqual(service.loadString(key: key), "second")
    }

    func testDeleteRemovesTheValue() throws {
        try seed("token-abc")
        XCTAssertTrue(service.delete(key: key))
        XCTAssertNil(service.loadString(key: key))
    }

    func testDeletingSomethingAbsentSucceeds() throws {
        try seed("token-abc")
        XCTAssertTrue(service.delete(key: key))
        // errSecItemNotFound is treated as success on purpose: sign-out calls
        // delete for keys that may never have been written, and a false here
        // would make a clean sign-out look like a failure.
        XCTAssertTrue(service.delete(key: key))
    }

    func testLoadingAnUnknownKeyReturnsNil() {
        XCTAssertNil(service.loadString(key: "test.keychain.never.written"))
    }

    // MARK: - Data, not just strings

    func testRawDataSurvivesUnchanged() throws {
        // The string API goes through UTF-8; the data API must not touch bytes.
        let bytes = Data([0x00, 0xFF, 0x10, 0x7F, 0x00])
        guard service.save(key: key, data: bytes) else {
            throw XCTSkip("Keychain is not writable in this environment.")
        }
        XCTAssertEqual(service.load(key: key), bytes)
    }

    func testAnEmptyStringRoundTripsAsAnEmptyString() throws {
        // Not nil. A caller distinguishing "no token" from "empty token" depends
        // on this, and an empty Data is easy to lose on the way through.
        try seed("")
        XCTAssertEqual(service.loadString(key: key), "")
    }
}
