import XCTest
@testable import DesMoinesInsider

/// IOS-DD-SAVED-08: a removal waiting out its undo window reads as not saved
/// everywhere, and undo restores it.
@MainActor
final class FavoritesPendingRemovalTests: XCTestCase {

    private var suiteName = ""
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        suiteName = "FavoritesPendingRemovalTests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        super.tearDown()
    }

    func testPendingRemovalHidesTheItemAndDropsTheCount() {
        let service = FavoritesService(defaults: defaults)
        service._testSeed(eventIds: ["e1", "e2"], restaurantIds: ["r1"])
        XCTAssertEqual(service.totalFavoritesCount, 3)

        service.markPendingRemoval(kind: .event, id: "e1")
        XCTAssertFalse(service.isFavorited("e1"))
        XCTAssertTrue(service.isFavorited("e2"))
        XCTAssertEqual(service.totalFavoritesCount, 2)
        XCTAssertEqual(service.visibleIds(.event), ["e2"])

        service.clearPendingRemoval(kind: .event, id: "e1")
        XCTAssertTrue(service.isFavorited("e1"))
        XCTAssertEqual(service.totalFavoritesCount, 3)
    }

    func testAPendingMarkForAnUnsavedIdChangesNothing() {
        let service = FavoritesService(defaults: defaults)
        service._testSeed(eventIds: ["e1"])
        service.markPendingRemoval(kind: .event, id: "other")
        XCTAssertEqual(service.totalFavoritesCount, 1)
    }
}

/// IOS-DD-SAVED-20: device stores are per user, and the guest store moves
/// into the account on sign-in.
@MainActor
final class FavoritesLocalKeyTests: XCTestCase {

    func testLocalKeyIsScopedToTheUser() {
        XCTAssertEqual(FavoritesService.localKey(base: "localArticleFavorites", userId: "u1"), "localArticleFavorites.u1")
        XCTAssertEqual(FavoritesService.localKey(base: "localArticleFavorites", userId: nil), "localArticleFavorites")
    }

    func testLegacyIdsMoveToTheUserKeyOnce() throws {
        let suite = "FavoritesLocalKeyTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }

        defaults.set(["a1", "a2"], forKey: "localArticleFavorites")
        defaults.set(["a3"], forKey: "localArticleFavorites.u1")

        let service = FavoritesService(defaults: defaults)
        service.migrateLegacyLocalFavorites(userId: "u1")

        XCTAssertEqual(Set(defaults.stringArray(forKey: "localArticleFavorites.u1") ?? []), ["a1", "a2", "a3"])
        XCTAssertNil(defaults.object(forKey: "localArticleFavorites"))
        XCTAssertEqual(service.localFavoriteIds(.article, userId: "u1"), ["a1", "a2", "a3"])
    }

    func testResetKeepsPerUserStoresAndClearsTheGuestStore() throws {
        let suite = "FavoritesLocalKeyTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }

        defaults.set(["g1"], forKey: "localArticleFavorites")
        defaults.set(["a1"], forKey: "localArticleFavorites.u1")

        let service = FavoritesService(defaults: defaults)
        service.reset()

        XCTAssertNil(defaults.object(forKey: "localArticleFavorites"))
        XCTAssertEqual(defaults.stringArray(forKey: "localArticleFavorites.u1"), ["a1"])
    }
}

/// IOS-DD-SAVED-13: what the Saved tab drops and fetches after a heart
/// changed elsewhere.
final class FavoritesReconcileTests: XCTestCase {

    func testDiff() {
        let result = SavedPlan.diff(loaded: ["a", "b", "c"], current: ["b", "c", "d"])
        XCTAssertEqual(result.toRemove, ["a"])
        XCTAssertEqual(result.toFetch, ["d"])
    }

    func testNoChangeIsNoWork() {
        let result = SavedPlan.diff(loaded: ["a"], current: ["a"])
        XCTAssertTrue(result.toRemove.isEmpty)
        XCTAssertTrue(result.toFetch.isEmpty)
    }
}

/// IOS-DD-SAVED-16: the banner's near/at-limit states.
@MainActor
final class FavoritesLimitBannerTests: XCTestCase {

    func testNearAndAtLimitWithACapOfThree() {
        XCTAssertEqual((0...3).map { FavoritesLimitBanner.isNearLimit(count: $0, max: 3) }, [false, false, true, true])
        XCTAssertEqual((0...3).map { FavoritesLimitBanner.isAtLimit(count: $0, max: 3) }, [false, false, false, true])
    }

    func testUnlimitedIsNeverNear() {
        XCTAssertFalse(FavoritesLimitBanner.isNearLimit(count: 50, max: -1))
        XCTAssertFalse(FavoritesLimitBanner.isAtLimit(count: 50, max: -1))
    }
}
