import XCTest
@testable import DesMoinesInsider

/// IOS-DD-PLATFORM-11: which main-frame hops stay inside the in-app browser.
@MainActor
final class WebViewPolicyTests: XCTestCase {

    func testDifferentSitesUnderOneSuffixAreNotTheSameSite() {
        XCTAssertFalse(WebView.Coordinator.sameSite("a.co.uk", "b.co.uk"))
        XCTAssertFalse(WebView.Coordinator.sameSite("victim.pages.dev", "attacker.pages.dev"))
    }

    func testFirstPartyHostsAreOneSite() {
        XCTAssertTrue(WebView.Coordinator.sameSite("www.desmoinesinsider.com", "desmoinesinsider.com"))
    }

    func testHostMatchIgnoresCase() {
        XCTAssertTrue(WebView.Coordinator.sameSite("example.com", "EXAMPLE.com"))
    }

    func testLookAlikeIsNotFirstParty() {
        XCTAssertFalse(WebView.Coordinator.sameSite("evildesmoinesinsider.com", "desmoinesinsider.com"))
    }
}
