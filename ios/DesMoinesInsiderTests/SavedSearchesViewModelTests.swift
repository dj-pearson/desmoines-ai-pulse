import XCTest
@testable import DesMoinesInsider

/// IOS-DD-SEARCH-11 and -12: duplicate detection, the server cap mapping, input
/// caps, and the sign-out reset.
@MainActor
final class SavedSearchesViewModelTests: XCTestCase {

    private func row(_ id: String, query: String) throws -> SavedSearch {
        let json = """
        { "id": "\(id)", "user_id": "u1", "name": "\(query)", "filters": { "query": "\(query)" } }
        """
        return try JSONDecoder().decode(SavedSearch.self, from: Data(json.utf8))
    }

    func testExistingMatchesCaseInsensitively() throws {
        let rows = [try row("a", query: "Live Music"), try row("b", query: "brunch")]
        XCTAssertEqual(SavedSearchesViewModel.existing(for: "  live music ", in: rows)?.id, "a")
        XCTAssertNil(SavedSearchesViewModel.existing(for: "live", in: rows))
        XCTAssertNil(SavedSearchesViewModel.existing(for: "   ", in: rows))
    }

    /// enforce_saved_searches_limit raises PT402 with HINT upgrade_required.
    /// The test target does not link Supabase, so the errors are local
    /// structs read through FavoritesService's reflection path.
    func testServerCapMapsToUpgrade() {
        struct CodeError: Error { let code: String }
        struct HintError: Error { let hint: String }
        XCTAssertTrue(FavoritesService.isServerCapError(CodeError(code: "PT402")))
        XCTAssertTrue(FavoritesService.isServerCapError(HintError(hint: "upgrade_required")))
        XCTAssertFalse(FavoritesService.isServerCapError(CodeError(code: "23505")))
    }

    func testNameAndQueryAreCapped() {
        let clean = SavedSearchesViewModel.sanitized(
            name: String(repeating: "n", count: 500),
            query: "  " + String(repeating: "q", count: 500) + "  "
        )
        XCTAssertEqual(clean.name.count, SavedSearchesViewModel.maxNameLength)
        XCTAssertEqual(clean.query.count, SavedSearchesViewModel.maxQueryLength)
        XCTAssertFalse(clean.query.hasPrefix(" "))
    }

    func testEmptyNameFallsBackToQuery() {
        let clean = SavedSearchesViewModel.sanitized(name: "   ", query: "jazz")
        XCTAssertEqual(clean.name, "jazz")
    }

    func testResetClearsRows() throws {
        let model = SavedSearchesViewModel.shared
        model._seed([try row("a", query: "jazz")], errorMessage: "boom")
        XCTAssertEqual(model.savedSearches.count, 1)

        model.reset()

        XCTAssertTrue(model.savedSearches.isEmpty)
        XCTAssertNil(model.errorMessage)
        XCTAssertNil(model.loadedForUserId)
    }
}
