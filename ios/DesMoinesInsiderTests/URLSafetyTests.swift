import XCTest
@testable import DesMoinesInsider

/// Covers the content-link safety helper (IOS-AUDIT-SEC-002): only http/https
/// content-supplied links are allowed; file:, tel:, javascript:, data:, and
/// custom schemes are rejected.
final class URLSafetyTests: XCTestCase {

    // MARK: - URL.isSafeWebLink

    func testHTTPAndHTTPSAreSafe() {
        XCTAssertTrue(URL(string: "http://example.com")!.isSafeWebLink)
        XCTAssertTrue(URL(string: "https://example.com/path?q=1")!.isSafeWebLink)
        XCTAssertTrue(URL(string: "HTTPS://Example.com")!.isSafeWebLink) // scheme is case-insensitive
    }

    func testNonWebSchemesAreUnsafe() {
        XCTAssertFalse(URL(string: "javascript:alert(1)")!.isSafeWebLink)
        XCTAssertFalse(URL(string: "file:///etc/passwd")!.isSafeWebLink)
        XCTAssertFalse(URL(string: "tel:+15555555555")!.isSafeWebLink)
        XCTAssertFalse(URL(string: "data:text/html;base64,PHNjcmlwdD4=")!.isSafeWebLink)
        XCTAssertFalse(URL(string: "ftp://example.com")!.isSafeWebLink)
        XCTAssertFalse(URL(string: "com.desmoines.aipulse://event/1")!.isSafeWebLink)
    }

    // MARK: - String.safeWebURL

    func testSafeWebURLPassesWebLinks() {
        XCTAssertEqual("https://example.com".safeWebURL?.absoluteString, "https://example.com")
        XCTAssertEqual("http://example.com/x".safeWebURL?.absoluteString, "http://example.com/x")
    }

    func testSafeWebURLDefaultsBareHostToHTTPS() {
        XCTAssertEqual("example.com".safeWebURL?.scheme, "https")
        XCTAssertEqual("www.example.com/path".safeWebURL?.scheme, "https")
    }

    func testSafeWebURLRejectsUnsafeSchemes() {
        XCTAssertNil("javascript:alert(1)".safeWebURL)
        XCTAssertNil("file:///etc/passwd".safeWebURL)
        XCTAssertNil("tel:+15555555555".safeWebURL)
        XCTAssertNil("data:text/html,<script>".safeWebURL)
    }

    func testSafeWebURLRejectsEmptyOrWhitespace() {
        XCTAssertNil("".safeWebURL)
        XCTAssertNil("   ".safeWebURL)
    }
}
