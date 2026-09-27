import XCTest
@testable import DesMoinesInsider

/// IOS-AUDIT-TEST-005 AC1/AC2, testable via IOS-AUDIT-TEST-006 AC3's seam.
///
/// The generation token is the kind of guard that is invisible when it works and
/// invisible when it does not: without it a pre-reset fetch appends cards built
/// from the OLD filter into the freshly reset deck, and the only symptom is a
/// user occasionally seeing a card they filtered out. Nothing logs, nothing
/// fails. It can only be asserted by holding a fetch open across a reset, which
/// needs an injected provider.
///
/// IOS-DD-DISCOVER-03/04/05/06/08 extend it: paging past already-swiped pages,
/// removing exactly the swiped card, the spinner across overlapping reloads,
/// closed restaurants, removable "More like this" filters and guest saves.
/// The fakes live in DiscoverFakes.swift.
@MainActor
final class DiscoverDeckTests: XCTestCase {

    private typealias Fake = FakeDiscoverEvents

    // MARK: - Deck population

    func testAFetchFillsTheDeck() async {
        let vm = DiscoverViewModel.testing(events: Fake(events: ["1", "2", "3"].map { Fake.event($0) }))

        await vm.reload()

        XCTAssertEqual(vm.deck.count, 3)
        XCTAssertFalse(vm.isLoading)
        XCTAssertFalse(vm.lastLoadFailed)
    }

    func testAnEmptyResultLeavesAnEmptyDeckWithoutFlaggingFailure() async {
        // "Nothing left to show" and "the load broke" are different states, and
        // the empty view has to be able to tell them apart.
        let vm = DiscoverViewModel.testing(events: Fake(events: []))

        await vm.reload()

        XCTAssertTrue(vm.deck.isEmpty)
        XCTAssertFalse(vm.lastLoadFailed)
        XCTAssertTrue(vm.isExhausted)
    }

    func testReloadReplacesTheDeckRatherThanAppending() async {
        var rows = [Fake.event("1"), Fake.event("2")]
        let fake = Fake(respond: { _ in .init(events: rows, totalCount: rows.count, hasMore: false) })
        let vm = DiscoverViewModel.testing(events: fake)
        await vm.reload()

        rows = [Fake.event("3")]
        await vm.reload()

        XCTAssertEqual(vm.deck.count, 1)
    }

    // MARK: - Generation token (AC2) and the spinner (IOS-DD-DISCOVER-04)

    func testResultsFromABeforeReloadFetchAreDiscardedAndOnlyTheNewestReloadClearsTheSpinner() async {
        // The whole point of fetchGeneration. A fetch that started before a
        // reload carries the OLD filter and offset; letting it land would mix
        // filtered-out cards into the new deck. And the older reload finishing
        // must not turn the spinner off while the newer fetch is running.
        let fake = Fake()
        let vm = DiscoverViewModel.testing(events: fake)

        let first = Task { await vm.reload() }
        _ = await waitUntil { fake.callCount == 1 }
        let second = Task { await vm.reload() }
        await settle()

        fake.resume(0, with: .success(Fake.page(["stale-1", "stale-2"])))
        await first.value
        XCTAssertTrue(vm.isLoading, "the stale reload cleared the spinner while the new fetch was pending")

        _ = await waitUntil { fake.callCount == 2 }
        fake.resume(1, with: .success(Fake.page(["fresh-1", "fresh-2"])))
        await second.value

        XCTAssertEqual(vm.deck.map(\.rawId), ["fresh-1", "fresh-2"], "stale results reached the deck")
        XCTAssertFalse(vm.isLoading)
    }

    func testBoostClearsTheDeckAndInvalidatesInFlightResults() async {
        // Boost narrows the filter and resets. A pre-boost fetch landing after
        // it would put exactly the cards the user swiped away from back on top.
        let vm = DiscoverViewModel.testing(events: Fake(events: [Fake.event("1"), Fake.event("2")]))
        await vm.reload()
        XCTAssertEqual(vm.deck.count, 2)

        guard let top = vm.deck.first else { return XCTFail("deck should be populated") }
        vm.boost(top)

        // Boost is synchronous up to the refetch: the deck must be empty
        // immediately, and isLoading up, so the empty state is never flashed
        // (IOS-AUDIT-UX-019).
        XCTAssertTrue(vm.deck.isEmpty)
        XCTAssertTrue(vm.isLoading)
    }

    // MARK: - Already-swiped pages (IOS-DD-DISCOVER-03)

    /// Pages of three: offsets 0 and 3 by default.
    private func pagedFake(_ pages: [Int: ([String], Bool)]) -> Fake {
        Fake(respond: { query in
            let (ids, hasMore) = pages[query.offset] ?? ([], false)
            return Fake.page(ids, hasMore: hasMore)
        })
    }

    func testAPageOfSeenCardsFetchesTheNextPage() async {
        let fake = pagedFake([0: (["1", "2", "3"], true), 3: (["4", "5"], false)])
        let seen: Set<String> = ["1", "2", "3"]
        let vm = DiscoverViewModel.testing(events: fake, swiped: { _, id in seen.contains(id) })

        await vm.reload()

        XCTAssertEqual(vm.deck.map(\.rawId), ["4", "5"])
        XCTAssertTrue(vm.isExhausted)
    }

    func testEverySwipedPageEndsExhaustedAfterTheLastPage() async {
        let fake = pagedFake([0: (["1", "2", "3"], true), 3: (["4", "5"], false)])
        let vm = DiscoverViewModel.testing(events: fake, swiped: { _, _ in true })

        await vm.reload()

        XCTAssertTrue(vm.deck.isEmpty)
        XCTAssertTrue(vm.isExhausted)
        XCTAssertEqual(fake.callCount, 2)
    }

    func testPagingPastSeenCardsStopsAtTheCap() async {
        // Every page is seen and the server always has more: stop after
        // maxEmptyPages rather than walking the whole table, and do not claim
        // the deck is exhausted.
        let fake = Fake(respond: { query in
            Fake.page(["p\(query.offset)"], hasMore: true)
        })
        let vm = DiscoverViewModel.testing(events: fake, swiped: { _, _ in true })

        await vm.reload()

        XCTAssertEqual(fake.callCount, DiscoverViewModel.maxEmptyPages)
        XCTAssertEqual(fake.callCount, 5)
        XCTAssertFalse(vm.isExhausted)
        XCTAssertTrue(vm.deck.isEmpty)
    }

    // MARK: - The swiped card, not the top card (IOS-DD-DISCOVER-04)

    func testSwipingACardThatIsNotInTheDeckRemovesNothing() async {
        // SwipeCardStack calls back 0.28s after the gesture. After a mode switch
        // in that window, removeFirst() dropped an unseen card.
        let vm = DiscoverViewModel.testing(events: Fake(events: ["1", "2", "3"].map { Fake.event($0) }))
        await vm.reload()

        vm.like(.event(Fake.event("9")))

        XCTAssertEqual(vm.deck.map(\.rawId), ["1", "2", "3"])
    }

    // MARK: - Honest contents (IOS-DD-DISCOVER-05)

    func testClosedRestaurantsAreNotDealt() async {
        var permanentlyClosed = Restaurant(id: "r1", name: "Gone")
        permanentlyClosed.businessStatus = "CLOSED_PERMANENTLY"
        var curatedClosed = Restaurant(id: "r2", name: "Also gone")
        curatedClosed.status = "closed"
        let open = Restaurant(id: "r3", name: "Open")
        let restaurants = FakeDiscoverRestaurants(respond: { _ in
            .init(restaurants: [permanentlyClosed, curatedClosed, open], totalCount: 3, hasMore: false)
        })
        let vm = DiscoverViewModel.testing(mode: .restaurants, restaurants: restaurants)

        await vm.reload()

        XCTAssertEqual(vm.deck.count, 1)
        XCTAssertEqual(vm.deck.first?.rawId, "r3")
    }

    func testTheMixedModeIsCalledThisWeek() {
        // It is a seven-day window with no hours check, not "Tonight".
        XCTAssertEqual(DiscoverMode.mixed.title, "This week")
        XCTAssertEqual(DiscoverMode.mixed.rawValue, "mixed", "stored in swipe_sessions.mode")
    }

    // MARK: - More like this (IOS-DD-DISCOVER-06)

    func testBoostingAnUncategorizedEventDoesNotFilterOnOther() async {
        // A null category maps to .other, and category = 'Other' matches
        // nothing, so the boost used to empty the deck.
        let vm = DiscoverViewModel.testing(events: Fake(events: [Fake.event("n", category: nil), Fake.event("m")]))
        await vm.reload()

        vm.boost(.event(Fake.event("n", category: nil)))

        XCTAssertNil(vm.filter.eventCategory)
        XCTAssertTrue(vm.boostedFields.isEmpty)
        XCTAssertEqual(vm.deck.map(\.rawId), ["m"], "the card was not moved past")
    }

    func testBoostingSetsARemovableCategory() async {
        let fake = Fake(events: [Fake.event("1"), Fake.event("2")])
        let vm = DiscoverViewModel.testing(events: fake)
        await vm.reload()

        vm.boost(.event(Fake.event("1")))
        XCTAssertEqual(vm.filter.eventCategory, .music)
        XCTAssertTrue(vm.boostedFields.contains(.eventCategory))
        XCTAssertEqual(vm.activeConstraints.first?.text, "More: Music")
        _ = await waitUntil { !vm.isLoading }

        await vm.removeConstraint(.eventCategory)

        XCTAssertNil(vm.filter.eventCategory)
        XCTAssertFalse(vm.boostedFields.contains(.eventCategory))
        XCTAssertNil(fake.queries.last?.category)
    }

    func testABoostThatFindsNothingFallsBack() async {
        let fake = Fake(respond: { query in
            query.category == nil ? Fake.page(["1"]) : Fake.page([])
        })
        let vm = DiscoverViewModel.testing(events: fake)
        await vm.reload()

        vm.boost(.event(Fake.event("1")))
        _ = await waitUntil { vm.boostFellBack }

        XCTAssertTrue(vm.boostFellBack)
        XCTAssertNil(vm.filter.eventCategory)
        XCTAssertTrue(vm.boostedFields.isEmpty)
    }

    func testALockedEntryFilterCannotBeRemoved() {
        var entry = DiscoverFilterContext()
        entry.eventCategory = .music
        let vm = DiscoverViewModel.testing(filter: entry, lockMode: true)

        XCTAssertFalse(vm.canRemove(.eventCategory))
        XCTAssertEqual(vm.activeConstraints.first?.isRemovable, false)
    }

    // MARK: - Guest saves (IOS-DD-DISCOVER-08)

    func testSaveFailuresAreClassified() {
        XCTAssertEqual(DiscoverViewModel.classify(FavoritesService.FavoritesError.notAuthenticated), .signIn)
        XCTAssertEqual(DiscoverViewModel.classify(FavoritesService.FavoritesError.limitReached(max: 25)), .limit)
        XCTAssertEqual(DiscoverViewModel.classify(URLError(.notConnectedToInternet)), .other)
    }

    func testAGuestLikeIsHeldForSignInNotReportedAsAFailure() async {
        let vm = DiscoverViewModel.testing(
            events: Fake(events: [Fake.event("1"), Fake.event("2")]),
            saveFavorite: { _ in throw FavoritesService.FavoritesError.notAuthenticated }
        )
        await vm.reload()

        vm.like(.event(Fake.event("1")))
        _ = await waitUntil { vm.needsSignInForLikes }

        XCTAssertEqual(vm.guestLikes.map(\.rawId), ["1"])
        XCTAssertTrue(vm.likedItems.isEmpty)
        XCTAssertFalse(vm.favoriteSaveFailed)
    }
}
