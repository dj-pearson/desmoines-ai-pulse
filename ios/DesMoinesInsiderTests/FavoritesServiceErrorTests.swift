import XCTest
@testable import DesMoinesInsider

/// A PostgREST-shaped error. The test target does not link Supabase, so the
/// service reads `code` and `hint` structurally (as RestaurantsService does).
private struct StubPostgrestError: Error {
    let code: String
    var hint: String? = nil
}

/// IOS-DD-SAVED-01/02/04: which errors wipe nothing, which fall back to the
/// device, and which are the server's favorites cap.
final class FavoritesServiceErrorTests: XCTestCase {

    // MARK: Cancellation (S01)

    func testCancellationErrorsAreCancellation() {
        XCTAssertTrue(FavoritesService.isCancellation(CancellationError()))
        XCTAssertTrue(FavoritesService.isCancellation(URLError(.cancelled)))
        XCTAssertTrue(FavoritesService.isCancellation(NSError(domain: NSURLErrorDomain, code: NSURLErrorCancelled)))
    }

    func testOtherErrorsAreNotCancellation() {
        XCTAssertFalse(FavoritesService.isCancellation(URLError(.timedOut)))
        XCTAssertFalse(FavoritesService.isCancellation(NSError(domain: "test", code: 1)))
    }

    // MARK: Missing table (S02)

    func testMissingTableCodesFallBackToTheDevice() {
        XCTAssertTrue(FavoritesService.isMissingTableError(StubPostgrestError(code: "42P01")))
        XCTAssertTrue(FavoritesService.isMissingTableError(StubPostgrestError(code: "PGRST205")))
    }

    func testOtherFailuresDoNotFallBackToTheDevice() {
        XCTAssertFalse(FavoritesService.isMissingTableError(StubPostgrestError(code: "PT402")))
        XCTAssertFalse(FavoritesService.isMissingTableError(StubPostgrestError(code: "42501")))
        XCTAssertFalse(FavoritesService.isMissingTableError(StubPostgrestError(code: "23505")))
        XCTAssertFalse(FavoritesService.isMissingTableError(URLError(.notConnectedToInternet)))
    }

    // MARK: Server cap (S04)

    func testTheServerCapIsRecognisedByCodeOrHint() {
        XCTAssertTrue(FavoritesService.isServerCapError(StubPostgrestError(code: "PT402")))
        XCTAssertTrue(FavoritesService.isServerCapError(StubPostgrestError(code: "P0001", hint: "upgrade_required")))
    }

    func testADuplicateIsNotTheCap() {
        XCTAssertFalse(FavoritesService.isServerCapError(StubPostgrestError(code: "23505")))
    }
}

/// IOS-DD-SAVED-03: the row iOS now inserts into content_favorites.
final class FavoritesContentRowTests: XCTestCase {

    private func json(_ row: ContentFavoriteRow) throws -> [String: String] {
        let data = try JSONEncoder().encode(row)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: String])
    }

    func testRestaurantRowKeys() throws {
        let row = ContentFavoriteRow(
            user_id: "u1",
            content_type: FavoritesService.ContentKind.restaurant.rawValue,
            content_id: "r1"
        )
        XCTAssertEqual(try json(row), ["user_id": "u1", "content_type": "restaurant", "content_id": "r1"])
    }

    func testAttractionRowKeys() throws {
        let row = ContentFavoriteRow(
            user_id: "u1",
            content_type: FavoritesService.ContentKind.attraction.rawValue,
            content_id: "a1"
        )
        XCTAssertEqual(try json(row)["content_type"], "attraction")
    }

    func testArticleRowKeys() throws {
        let row = ContentFavoriteRow(
            user_id: "u1",
            content_type: FavoritesService.ContentKind.article.rawValue,
            content_id: "g1"
        )
        XCTAssertEqual(try json(row), ["user_id": "u1", "content_type": "article", "content_id": "g1"])
    }

    /// XPLAT-013: every saved kind but events lives in content_favorites.
    func testContentKindsMapOneToOneOntoFavoriteKinds() {
        for kind in FavoritesService.ContentKind.allCases {
            XCTAssertEqual(FavoritesService.ContentKind(kind.favoriteKind), kind)
        }
        XCTAssertNil(FavoritesService.ContentKind(.event))
    }
}

/// XPLAT-013: when an article save stays on the device. content_type rejects
/// 'article' (23514) until 20261116000010 is applied; for the other kinds a
/// CHECK failure is a real error and must not be hidden as a local save.
final class FavoritesStoreUnavailableTests: XCTestCase {

    func testAMissingTableIsUnavailableForEveryKind() {
        for kind in FavoritesService.ContentKind.allCases {
            XCTAssertTrue(FavoritesService.isStoreUnavailable(StubPostgrestError(code: "42P01"), kind: kind))
            XCTAssertTrue(FavoritesService.isStoreUnavailable(StubPostgrestError(code: "PGRST205"), kind: kind))
        }
    }

    func testACheckViolationIsUnavailableOnlyForArticles() {
        let check = StubPostgrestError(code: "23514")
        XCTAssertTrue(FavoritesService.isStoreUnavailable(check, kind: .article))
        XCTAssertFalse(FavoritesService.isStoreUnavailable(check, kind: .restaurant))
        XCTAssertFalse(FavoritesService.isStoreUnavailable(check, kind: .attraction))
    }

    func testOtherFailuresAreThrownNotSavedLocally() {
        for code in ["PT402", "42501", "23505"] {
            XCTAssertFalse(FavoritesService.isStoreUnavailable(StubPostgrestError(code: code), kind: .article))
        }
        XCTAssertFalse(FavoritesService.isStoreUnavailable(URLError(.notConnectedToInternet), kind: .article))
    }
}

/// IOS-DD-SAVED-05: in-flight adds count against the cap.
final class FavoritesCapMathTests: XCTestCase {

    func testCapMath() {
        XCTAssertFalse(FavoritesService.wouldExceedCap(current: 2, pending: 0, limit: 3))
        XCTAssertTrue(FavoritesService.wouldExceedCap(current: 2, pending: 1, limit: 3))
        XCTAssertFalse(FavoritesService.wouldExceedCap(current: 5, pending: 0, limit: -1))
        XCTAssertFalse(FavoritesService.wouldExceedCap(current: 0, pending: 0, limit: 0))
    }
}

/// IOS-DD-SAVED-09/17: id chunks for the `in` filter.
final class FavoritesChunkTests: XCTestCase {

    func testNoIdsIsNoChunks() {
        XCTAssertEqual(FavoritesService.chunks([], size: 100), [])
    }

    func testChunksKeepOrderAndSize() {
        let ids = (0..<250).map { "id\($0)" }
        let chunks = FavoritesService.chunks(ids, size: 100)
        XCTAssertEqual(chunks.map(\.count), [100, 100, 50])
        XCTAssertEqual(chunks.flatMap { $0 }, ids)
    }
}
