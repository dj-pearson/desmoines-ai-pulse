import XCTest
@testable import DesMoinesInsider

/// IOS-DD-PLATFORM-03: a link to a listing that is gone says "no longer
/// available"; only a real fetch failure says "check your connection".
@MainActor
final class DeepLinkResolverTests: XCTestCase {

    /// PostgREST's "0 rows" answer to a `.single()`, shaped like PostgrestError.
    private struct NotFound: Error {
        let code: String? = "PGRST116"
    }

    func testNotFoundIsUnavailable() {
        XCTAssertEqual(DeepLinkResolverView.phase(for: NotFound()), .unavailable)
    }

    func testAnUnresolvableSlugIsUnavailable() {
        XCTAssertEqual(DeepLinkResolverView.phase(for: EventsService.SlugNotFound()), .unavailable)
    }

    func testNoConnectionIsOffline() {
        XCTAssertEqual(DeepLinkResolverView.phase(for: URLError(.notConnectedToInternet)), .offline)
    }
}
