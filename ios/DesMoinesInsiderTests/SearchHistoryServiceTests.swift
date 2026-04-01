import XCTest
@testable import DesMoinesInsider

@MainActor
final class SearchHistoryServiceTests: XCTestCase {

    private var service: SearchHistoryService!

    override func setUp() async throws {
        await MainActor.run {
            service = SearchHistoryService.shared
            service.clearAll()
        }
    }

    override func tearDown() async throws {
        await MainActor.run {
            service.clearAll()
        }
    }

    // MARK: - Recording

    func testRecordAddsToRecentSearches() {
        service.record("pizza")
        XCTAssertEqual(service.recentSearches, ["pizza"])
    }

    func testRecordMovesDuplicateToFront() {
        service.record("pizza")
        service.record("sushi")
        service.record("pizza")
        XCTAssertEqual(service.recentSearches, ["pizza", "sushi"])
    }

    func testRecordIsCaseInsensitiveForDedup() {
        service.record("Pizza")
        service.record("pizza")
        XCTAssertEqual(service.recentSearches.count, 1)
        XCTAssertEqual(service.recentSearches.first, "pizza") // latest casing wins
    }

    func testRecordIgnoresEmptyStrings() {
        service.record("")
        service.record("   ")
        XCTAssertTrue(service.recentSearches.isEmpty)
    }

    func testRecordLimitsToTenItems() {
        for i in 1...15 {
            service.record("query-\(i)")
        }
        XCTAssertEqual(service.recentSearches.count, 10)
        XCTAssertEqual(service.recentSearches.first, "query-15") // most recent first
    }

    // MARK: - Remove

    func testRemoveAtIndex() {
        service.record("a")
        service.record("b")
        service.record("c")

        service.remove(at: 1) // remove "b" (index 1 after c, b, a -> c, a)

        XCTAssertEqual(service.recentSearches, ["c", "a"])
    }

    func testRemoveOutOfBoundsDoesNotCrash() {
        service.record("a")
        service.remove(at: 99)
        XCTAssertEqual(service.recentSearches, ["a"])
    }

    // MARK: - Clear

    func testClearAll() {
        service.record("a")
        service.record("b")

        service.clearAll()
        XCTAssertTrue(service.recentSearches.isEmpty)
    }
}
