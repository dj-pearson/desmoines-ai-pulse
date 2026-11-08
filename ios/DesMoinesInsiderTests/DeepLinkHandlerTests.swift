import XCTest
@testable import DesMoinesInsider

// DeepLinkHandler is @MainActor (@Observable singleton), so the test case is too
// — its `handle(_:)` / `consumeDestination()` are main-actor isolated.
@MainActor
final class DeepLinkHandlerTests: XCTestCase {

    private var handler: DeepLinkHandler!

    override func setUp() async throws {
        handler = DeepLinkHandler.shared
        // Consume any pending destination from previous tests
        _ = handler.consumeDestination()
    }

    // MARK: - Universal Links

    func testValidEventUniversalLink() {
        let url = URL(string: "https://desmoinesinsider.com/events/550e8400-e29b-41d4-a716-446655440000")!
        let result = handler.handle(url)
        XCTAssertTrue(result)

        let dest = handler.consumeDestination()
        XCTAssertEqual(dest, .event(id: "550e8400-e29b-41d4-a716-446655440000"))
    }

    func testValidRestaurantUniversalLink() {
        let url = URL(string: "https://desmoinesinsider.com/restaurants/550e8400-e29b-41d4-a716-446655440000")!
        let result = handler.handle(url)
        XCTAssertTrue(result)

        let dest = handler.consumeDestination()
        XCTAssertEqual(dest, .restaurant(id: "550e8400-e29b-41d4-a716-446655440000"))
    }

    // MARK: - Restaurant slugs (IOS-DD-RESTAURANTS-09)

    func testRestaurantSlugUniversalLinkOpensTheRestaurant() {
        let url = URL(string: "https://desmoinesinsider.com/restaurants/zombie-burger-drink-lab")!
        XCTAssertTrue(handler.handle(url))
        XCTAssertEqual(handler.consumeDestination(), .restaurant(id: "zombie-burger-drink-lab"))
    }

    func testRestaurantLandingPageOpensTheFilteredTab() {
        let url = URL(string: "https://desmoinesinsider.com/restaurants/open-now")!
        XCTAssertTrue(handler.handle(url))
        XCTAssertEqual(handler.consumeDestination(), .restaurantLanding(RestaurantLinkFilter(openNow: true)))
    }

    // MARK: - Restaurant landing pages (IOS-AUDIT-FEAT-043)

    func testRestaurantLandingLinksCarryTheirFilter() {
        XCTAssertEqual(dest("/restaurants/new"), .restaurantLanding(RestaurantLinkFilter(newOpenings: true)))
        XCTAssertEqual(dest("/restaurants/dietary/vegan"), .restaurantLanding(RestaurantLinkFilter(diet: "vegan")))
        XCTAssertEqual(dest("/restaurants/dietary/gluten-free"), .restaurantLanding(RestaurantLinkFilter(diet: "gluten-free")))
        // The web's open-now diet filter and the legacy ?diet= index form.
        XCTAssertEqual(dest("/restaurants/open-now?diet=Halal"),
                       .restaurantLanding(RestaurantLinkFilter(openNow: true, diet: "halal")))
        XCTAssertEqual(dest("/restaurants/dietary?diet=keto"), .restaurantLanding(RestaurantLinkFilter(diet: "keto")))
        // IOS-AUDIT-FEAT-044: kosher was the one web diet with no Dining key
        // and opened the plain tab.
        XCTAssertEqual(dest("/restaurants/dietary/kosher"), .restaurantLanding(RestaurantLinkFilter(diet: "kosher")))
        XCTAssertEqual(dest("/restaurants/open-now?diet=kosher"),
                       .restaurantLanding(RestaurantLinkFilter(openNow: true, diet: "kosher")))
    }

    func testDietTheDiningFilterLacksOpensTheUnfilteredTab() {
        // An unknown diet and the bare index have nothing to narrow by.
        XCTAssertEqual(dest("/restaurants/dietary/paleo"), .tab(.restaurants))
        XCTAssertEqual(dest("/restaurants/dietary"), .tab(.restaurants))
        // An unknown open-now diet drops the diet, not the open-now filter.
        XCTAssertEqual(dest("/restaurants/open-now?diet=paleo"), .restaurantLanding(RestaurantLinkFilter(openNow: true)))
    }

    func testLandingLinkPresetIsOnlyAnExactMatch() {
        XCTAssertEqual(RestaurantLinkFilter(openNow: true).preset, .openNow)
        XCTAssertEqual(RestaurantLinkFilter(newOpenings: true).preset, .newOpenings)
        XCTAssertNil(RestaurantLinkFilter(openNow: true, diet: "vegan").preset)
        XCTAssertNil(RestaurantLinkFilter(diet: "vegan").preset)
    }

    func testRestaurantLinkIsStagedUntilConsumed() {
        let link = RestaurantLinkFilter(diet: "vegan")
        handler.stageRestaurantLink(link)
        XCTAssertEqual(handler.consumeRestaurantLink(), link)
        XCTAssertNil(handler.consumeRestaurantLink())
    }

    func testMalformedRestaurantSlugOpensTheTab() {
        let url = URL(string: "https://desmoinesinsider.com/restaurants/Bad%20Slug")!
        XCTAssertTrue(handler.handle(url))
        XCTAssertEqual(handler.consumeDestination(), .tab(.restaurants))
    }

    // MARK: - Attraction slugs (IOS-DD-BROWSE-12)

    func testAttractionSlugUniversalLinkOpensTheAttraction() {
        let url = URL(string: "https://desmoinesinsider.com/attractions/blank-park-zoo")!
        XCTAssertTrue(handler.handle(url))
        XCTAssertEqual(handler.consumeDestination(), .attraction(id: "blank-park-zoo"))
    }

    func testAttractionUUIDUniversalLinkStillWorks() {
        let id = "550e8400-e29b-41d4-a716-446655440000"
        XCTAssertTrue(handler.handle(URL(string: "https://desmoinesinsider.com/attractions/\(id)")!))
        XCTAssertEqual(handler.consumeDestination(), .attraction(id: id))
    }

    func testMalformedAttractionSlugsFallBackToHome() {
        for path in ["Bad%20Slug", "a--b", String(repeating: "a", count: 121)] {
            let url = URL(string: "https://desmoinesinsider.com/attractions/\(path)")!
            XCTAssertTrue(handler.handle(url), path)
            XCTAssertEqual(handler.consumeDestination(), .tab(.home), path)
        }
    }

    func testAttractionLinkIdBounds() {
        XCTAssertEqual(DeepLinkHandler.attractionLinkId(String(repeating: "a", count: 120)), String(repeating: "a", count: 120))
        XCTAssertNil(DeepLinkHandler.attractionLinkId(String(repeating: "a", count: 121)))
        XCTAssertNil(DeepLinkHandler.attractionLinkId("-zoo"))
    }

    func testInvalidIDUniversalLinkFallsBackToTab() {
        // "not-a-uuid" is now a well-formed event slug (IOS-DD-PLATFORM-01);
        // a segment that cannot be a slug still falls back.
        let url = URL(string: "https://desmoinesinsider.com/events/Bad%20Slug")!
        let result = handler.handle(url)
        XCTAssertTrue(result)

        let dest = handler.consumeDestination()
        XCTAssertEqual(dest, .tab(.home)) // Invalid event ID falls back to home
    }

    // MARK: - Spotlight (IOS-AUDIT-FEAT-027)

    func testSpotlightEventIdentifierRoutes() {
        let id = "550e8400-e29b-41d4-a716-446655440000"
        XCTAssertTrue(handler.handleSpotlightIdentifier("event-\(id)"))
        XCTAssertEqual(handler.consumeDestination(), .event(id: id))
    }

    func testSpotlightRestaurantIdentifierRoutes() {
        let id = "550e8400-e29b-41d4-a716-446655440000"
        XCTAssertTrue(handler.handleSpotlightIdentifier("restaurant-\(id)"))
        XCTAssertEqual(handler.consumeDestination(), .restaurant(id: id))
    }

    func testSpotlightUnknownTypeIsNotRouted() {
        // A type with no detail destination must not crash or route to the
        // wrong screen.
        XCTAssertFalse(handler.handleSpotlightIdentifier("neighborhood-550e8400-e29b-41d4-a716-446655440000"))
        XCTAssertNil(handler.consumeDestination())
    }

    // MARK: - Hotels and articles (IOS-DD-GUIDES-22)

    func testSpotlightHotelRoutes() {
        let id = "550e8400-e29b-41d4-a716-446655440000"
        XCTAssertTrue(handler.handleSpotlightIdentifier("hotel-\(id)"))
        XCTAssertEqual(handler.consumeDestination(), .hotel(id: id))
    }

    func testSpotlightArticleRoutes() {
        let id = "550e8400-e29b-41d4-a716-446655440000"
        XCTAssertTrue(handler.handleSpotlightIdentifier("article-\(id)"))
        XCTAssertEqual(handler.consumeDestination(), .article(id: id))
    }

    func testStaySlugUniversalLink() {
        XCTAssertTrue(handler.handle(URL(string: "https://desmoinesinsider.com/stay/surety-hotel")!))
        XCTAssertEqual(handler.consumeDestination(), .hotel(id: "surety-hotel"))
    }

    func testArticlesSlugUniversalLink() {
        XCTAssertTrue(handler.handle(URL(string: "https://desmoinesinsider.com/articles/best-patios-2026")!))
        XCTAssertEqual(handler.consumeDestination(), .article(id: "best-patios-2026"))
    }

    // MARK: - /stay/near/<venue> is a web page, not a hotel (IOS-AUDIT-004)

    func testStayNearVenueOpensTheWebPage() {
        let url = URL(string: "https://desmoinesinsider.com/stay/near/wells-fargo-arena")!
        XCTAssertTrue(handler.handle(url))
        XCTAssertEqual(handler.consumeDestination(), .web(url))
    }

    func testStayNearIsNeverReadAsAHotelSlug() {
        let url = URL(string: "https://desmoinesinsider.com/stay/near/principal-park")!
        XCTAssertNotEqual(handler.destination(for: url), .hotel(id: "near"))
    }

    func testBareOrMalformedStayNearOpensTheStayList() {
        for path in ["/stay/near", "/stay/near/Not%20A%20Slug", "/stay/near/a/b",
                     "/stay/near/550e8400-e29b-41d4-a716-446655440000"] {
            let url = URL(string: "https://desmoinesinsider.com\(path)")!
            XCTAssertEqual(handler.destination(for: url), .discover(.stay), path)
        }
    }

    func testStayHotelSlugStillOpensTheHotel() {
        let path = ["stay", "surety-hotel"]
        let url = URL(string: "https://desmoinesinsider.com/stay/surety-hotel")!
        XCTAssertNil(DeepLinkHandler.stayNearDestination(path, url: url))
    }

    func testBadArticleSegmentFallsBackToArticlesHub() {
        XCTAssertTrue(handler.handle(URL(string: "https://desmoinesinsider.com/articles/Not%20A%20Slug")!))
        XCTAssertEqual(handler.consumeDestination(), .discover(.articles))
    }

    // MARK: - destination(for:) (IOS-DD-GUIDES-21)

    func testDestinationForURLDoesNotSetPending() {
        let url = URL(string: "https://desmoinesinsider.com/restaurants/zombie-burger")!
        XCTAssertEqual(handler.destination(for: url), .restaurant(id: "zombie-burger"))
        XCTAssertNil(handler.pendingDestination)
    }

    // MARK: - Custom Scheme

    // These build the URL from `Config.appBundleId` rather than a literal. They
    // previously used a "dsminsider://" scheme that appears nowhere else in the
    // project — Info.plist registers only "com.desmoines.aipulse" — so every
    // custom-scheme case parsed to nil and the four tests below failed.

    func testValidEventCustomScheme() {
        let url = URL(string: "\(Config.appBundleId)://event/550e8400-e29b-41d4-a716-446655440000")!
        let result = handler.handle(url)
        XCTAssertTrue(result)

        let dest = handler.consumeDestination()
        XCTAssertEqual(dest, .event(id: "550e8400-e29b-41d4-a716-446655440000"))
    }

    func testHomeTabCustomScheme() {
        let url = URL(string: "\(Config.appBundleId)://home")!
        let result = handler.handle(url)
        XCTAssertTrue(result)

        let dest = handler.consumeDestination()
        XCTAssertEqual(dest, .tab(.home))
    }

    func testInvalidIDCustomSchemeFallsBackToTab() {
        let url = URL(string: "\(Config.appBundleId)://restaurant/malicious-input")!
        let result = handler.handle(url)
        XCTAssertTrue(result)

        let dest = handler.consumeDestination()
        XCTAssertEqual(dest, .tab(.restaurants)) // Invalid restaurant ID falls back to restaurants tab
    }

    // MARK: - Consume

    func testConsumeDestinationClearsIt() {
        let url = URL(string: "\(Config.appBundleId)://home")!
        _ = handler.handle(url)

        let first = handler.consumeDestination()
        XCTAssertNotNil(first)

        let second = handler.consumeDestination()
        XCTAssertNil(second)
    }

    // MARK: - Unknown URLs

    func testUnknownHostReturnsFalse() {
        let url = URL(string: "https://unknown.com/events/550e8400-e29b-41d4-a716-446655440000")!
        let result = handler.handle(url)
        XCTAssertFalse(result)
    }

    // MARK: - Event slugs (IOS-DD-PLATFORM-01)

    private func dest(_ path: String) -> DeepLinkHandler.Destination? {
        handler.destination(for: URL(string: "https://desmoinesinsider.com\(path)")!)
    }

    func testEventSlugOpensTheEvent() {
        XCTAssertEqual(dest("/events/jazz-in-the-park-2026-09-08"), .event(id: "jazz-in-the-park-2026-09-08"))
    }

    func testEventUUIDStillOpensTheEvent() {
        let id = "550e8400-e29b-41d4-a716-446655440000"
        XCTAssertEqual(dest("/events/\(id)"), .event(id: id))
    }

    func testEventLandingPages() {
        XCTAssertEqual(dest("/events/today"), .search(query: "today"))
        XCTAssertEqual(dest("/events/free"), .search(query: "free events"))
        XCTAssertEqual(dest("/events/west-des-moines"), .search(query: "events in west des moines"))
        XCTAssertEqual(dest("/events/this-weekend"), .discover(.weekend))
        XCTAssertEqual(dest("/events/Bad%20Slug"), .tab(.home))
    }

    // MARK: - Landing pages that used to open Home (IOS-AUDIT-002)

    private func site(_ path: String) -> URL {
        URL(string: "https://desmoinesinsider.com\(path)")!
    }

    func testNearMeLinkOpensTheMap() {
        XCTAssertEqual(dest("/events/near-me"), .tab(.map))
        // The web's own state (origin, radius) has no Map equivalent; the
        // link still opens the Map rather than Home.
        XCTAssertEqual(dest("/events/near-me?from=ankeny&r=10"), .tab(.map))
    }

    func testDateNightLinkOpensTheWebPage() {
        XCTAssertEqual(dest("/events/date-night"), .web(site("/events/date-night")))
    }

    // MARK: - Month archive and day ranges (IOS-AUDIT-003)

    private func monthSearch(_ slug: String) -> DeepLinkHandler.Destination {
        var filters = SearchFilters(tabHint: .events)
        filters.dayRange = EventDayRange(monthSlug: slug)
        return .eventSearch(query: "", filters: filters)
    }

    private func utc(_ iso: String) -> Date {
        ISO8601DateFormatter().date(from: iso)!
    }

    func testMonthArchiveLinkSearchesThatMonthUntilItIsOver() {
        let url = site("/events/june-2026")
        let before = utc("2026-05-15T12:00:00Z")
        let lastMinute = utc("2026-07-01T04:59:00Z") // 11:59pm June 30, Central
        let over = utc("2026-07-01T05:00:00Z")       // midnight July 1, Central
        XCTAssertEqual(DeepLinkHandler.eventDestination("june-2026", url: url, now: before), monthSearch("june-2026"))
        XCTAssertEqual(DeepLinkHandler.eventDestination("june-2026", url: url, now: lastMinute), monthSearch("june-2026"))
        // Search hides events that are over, so a past month opens the archive.
        XCTAssertEqual(DeepLinkHandler.eventDestination("june-2026", url: url, now: over), .web(url))
    }

    func testPastMonthLinkStillOpensTheWebPage() {
        // June 2026 is over on any clock this test runs on.
        XCTAssertEqual(dest("/events/june-2026"), .web(site("/events/june-2026")))
    }

    func testDayRangeLinkKeepsItsDates() {
        var june = SearchFilters(tabHint: .events)
        june.dayRange = EventDayRange(from: "2026-06-01", to: "2026-06-30")
        XCTAssertEqual(dest("/events?from=2026-06-01&to=2026-06-30"), .eventSearch(query: "", filters: june))

        var oneDay = SearchFilters(freeOnly: true, tabHint: .events)
        oneDay.dayRange = EventDayRange(from: "2026-06-05", to: nil)
        XCTAssertEqual(dest("/events?from=2026-06-05&price=free"), .eventSearch(query: "", filters: oneDay))
    }

    func testDayRangeLinkFollowsTheWebsPrecedence() {
        // A known preset wins over from/to.
        var today = SearchFilters(tabHint: .events)
        today.datePreset = .today
        XCTAssertEqual(dest("/events?preset=today&from=2026-06-01&to=2026-06-30"), .eventSearch(query: "", filters: today))
        // An unparseable from is no date filter, and with nothing else that is Home.
        XCTAssertEqual(dest("/events?from=someday&to=2026-06-30"), .tab(.home))
    }

    func testMonthLikeSlugsThatAreNotMonthPagesAreUnchanged() {
        // Not a month name, or not a bare <month>-<yyyy>: an event slug.
        XCTAssertEqual(dest("/events/june-bug-2026"), .event(id: "june-bug-2026"))
        XCTAssertEqual(dest("/events/june-2026-concert"), .event(id: "june-2026-concert"))
        // Capitalised is malformed for a slug and not a month page either.
        XCTAssertEqual(dest("/events/June-2026"), .tab(.home))
    }

    func testBareSeriesIsTheOnlyLandingSegmentThatOpensHome() {
        for segment in EventSlug.landingSegments.sorted() {
            let destination = dest("/events/\(segment)")
            if segment == "series" {
                XCTAssertEqual(destination, .tab(.home), segment)
            } else {
                XCTAssertNotEqual(destination, .tab(.home), segment)
            }
        }
    }

    func testLandingLinksAreRoutedNotJustParsed() {
        XCTAssertTrue(handler.handle(site("/events/near-me")))
        XCTAssertEqual(handler.consumeDestination(), .tab(.map))
        XCTAssertTrue(handler.handle(site("/events/may-2026")))
        XCTAssertEqual(handler.consumeDestination(), .web(site("/events/may-2026")))
    }

    // MARK: - Event series (IOS-AUDIT-FEAT-045)

    func testKnownEventSeriesLinkOpensTheNativeSeries() {
        // Was .event(id: "series"), a detail screen that found nothing, then
        // the web page (IOS-AUDIT-FEAT-045); now the native screen (046).
        XCTAssertEqual(dest("/events/series/panda-fest"), .eventSeries(slug: "panda-fest"))
        let tracked = URL(string: "https://www.desmoinesinsider.com/events/series/cloris-awards?utm_source=share")!
        XCTAssertEqual(handler.destination(for: tracked), .eventSeries(slug: "cloris-awards"))
    }

    func testEverySeriesTheAppKnowsOpensNatively() {
        for def in EventSeries.all {
            XCTAssertEqual(dest(EventSeries.path(def)), .eventSeries(slug: def.slug), def.slug)
        }
    }

    func testUnknownWellFormedSeriesLinkStillOpensOnTheWeb() {
        // A series the web added after this build shipped.
        let url = URL(string: "https://desmoinesinsider.com/events/series/some-new-festival")!
        XCTAssertEqual(handler.destination(for: url), .web(url))
    }

    func testMalformedOrBareEventSeriesLinkOpensHome() {
        XCTAssertEqual(dest("/events/series"), .tab(.home))
        XCTAssertEqual(dest("/events/series/Panda-Fest"), .tab(.home))
        XCTAssertEqual(dest("/events/series/panda%20fest"), .tab(.home))
        XCTAssertEqual(dest("/events/series/panda-fest/2026"), .tab(.home))
        XCTAssertEqual(dest("/events/series/" + String(repeating: "a", count: 121)), .tab(.home))
    }

    func testAnEventWhoseSlugStartsWithSeriesStillOpens() {
        XCTAssertEqual(dest("/events/series-finale-watch-party-2026-11-20"),
                       .event(id: "series-finale-watch-party-2026-11-20"))
    }

    func testEventSeriesLinkIsRoutedNotJustParsed() {
        let url = URL(string: "https://desmoinesinsider.com/events/series/jazz-in-july")!
        XCTAssertTrue(handler.handle(url))
        XCTAssertEqual(handler.consumeDestination(), .eventSeries(slug: "jazz-in-july"))
    }

    // MARK: - Neighborhood guides (IOS-AUDIT-FEAT-038)

    func testNeighborhoodLinkOpensThatGuide() {
        XCTAssertEqual(dest("/neighborhoods/ankeny"), .neighborhood(slug: "ankeny"))
        XCTAssertEqual(dest("/neighborhoods/west-des-moines"), .neighborhood(slug: "west-des-moines"))
        // The web 301s these two to /things-to-do/..., but the app claims
        // /neighborhoods/* and has a native guide for both.
        XCTAssertEqual(dest("/neighborhoods/east-village"), .neighborhood(slug: "east-village"))
        XCTAssertEqual(dest("/neighborhoods/downtown"), .neighborhood(slug: "downtown"))
    }

    func testEveryWebNeighborhoodSlugHasANativeGuide() {
        // src/lib/neighborhoods.ts NEIGHBORHOODS, the slugs the web links to.
        let webSlugs = ["east-village", "west-des-moines", "ankeny", "urbandale",
                        "johnston", "clive", "waukee", "altoona"]
        for slug in webSlugs {
            XCTAssertEqual(dest("/neighborhoods/\(slug)"), .neighborhood(slug: slug), slug)
        }
    }

    func testUnknownOrMalformedNeighborhoodFallsBackToTheHub() {
        XCTAssertEqual(dest("/neighborhoods/beaverdale"), .discover(.neighborhoods))
        XCTAssertEqual(dest("/neighborhoods/Ankeny"), .discover(.neighborhoods))
        XCTAssertEqual(dest("/neighborhoods/ankeny%20"), .discover(.neighborhoods))
        XCTAssertEqual(dest("/neighborhoods"), .discover(.neighborhoods))
    }

    func testNeighborhoodLinkIsRoutedNotJustParsed() {
        XCTAssertTrue(handler.handle(URL(string: "https://desmoinesinsider.com/neighborhoods/clive")!))
        XCTAssertEqual(handler.consumeDestination(), .neighborhood(slug: "clive"))
    }

    // MARK: - Best Of categories (IOS-AUDIT-FEAT-040)

    func testBestOfCategoryLinkOpensThatCategory() {
        // BestOfCategoryView shares /best-of/<category.slug>; it used to open the hub.
        XCTAssertEqual(dest("/best-of/best-pizza"), .bestOfCategory(slug: "best-pizza"))
        XCTAssertEqual(dest("/best-of/brunch"), .bestOfCategory(slug: "brunch"))
        XCTAssertEqual(dest("/best-of/best-pizza?utm_source=share"), .bestOfCategory(slug: "best-pizza"))
    }

    func testMalformedBestOfLinkFallsBackToTheHub() {
        XCTAssertEqual(dest("/best-of"), .discover(.bestOf))
        XCTAssertEqual(dest("/best-of/Best-Pizza"), .discover(.bestOf))
        XCTAssertEqual(dest("/best-of/best%20pizza"), .discover(.bestOf))
        XCTAssertEqual(dest("/best-of/best-pizza-"), .discover(.bestOf))
        XCTAssertEqual(dest("/best-of/" + String(repeating: "a", count: 121)), .discover(.bestOf))
        // The web routes by slug, never by id.
        XCTAssertEqual(dest("/best-of/550e8400-e29b-41d4-a716-446655440000"), .discover(.bestOf))
    }

    func testBestOfCategoryLinkIsRoutedNotJustParsed() {
        XCTAssertTrue(handler.handle(URL(string: "https://www.desmoinesinsider.com/best-of/best-coffee")!))
        XCTAssertEqual(handler.consumeDestination(), .bestOfCategory(slug: "best-coffee"))
    }

    // MARK: - Nothing claimed strands the user (IOS-DD-PLATFORM-02)

    func testEveryClaimedPathRoutes() {
        let paths = [
            "/search", "/search?q=brunch", "/search/advanced",
            "/attractions", "/attractions/science-center-of-iowa",
            "/stay", "/stay/hotel-x", "/stay/near/wells-fargo-arena", "/weekend", "/deals", "/best-of", "/best-of/brunch",
            "/music", "/sports", "/outdoors",
            "/neighborhoods", "/neighborhoods/east-village",
            "/events", "/events/today", "/restaurants", "/restaurants/open-now",
            "/restaurants/dietary/vegan", "/trip-planner", "/articles", "/articles/foo",
        ]
        for path in paths {
            XCTAssertNotNil(dest(path), path)
        }
    }

    func testSearchQueryLinkSearches() {
        XCTAssertEqual(dest("/search?q=brunch"), .search(query: "brunch"))
        XCTAssertEqual(dest("/search?q=%20%20"), .tab(.search))
        XCTAssertEqual(dest("/search/advanced"), .tab(.search))
    }

    // MARK: - Filtered /events links (IOS-AUDIT-FEAT-041)

    func testFilteredEventsLinkSearchesWithThoseFilters() {
        // The web hub's own "free this weekend" tile (hubLinks.ts).
        var weekendFree = SearchFilters(freeOnly: true, tabHint: .events)
        weekendFree.datePreset = .thisWeekend
        XCTAssertEqual(dest("/events?preset=this-weekend&price=free"), .eventSearch(query: "", filters: weekendFree))

        // A category tile, spelled the way the web writes it.
        var festivals = SearchFilters(tabHint: .events)
        festivals.category = .festival
        XCTAssertEqual(dest("/events?category=Festival"), .eventSearch(query: "", filters: festivals))
    }

    func testWeekPresetLinksKeepTheirDates() {
        // The hub's This week / Next week / Next 7 days chips (IOS-AUDIT-FEAT-042).
        let cases: [(String, DateFilterPreset)] = [
            ("this-week", .thisWeek), ("next-week", .nextWeek),
            ("next-7-days", .next7Days), ("next_7_days", .next7Days),
        ]
        for (slug, preset) in cases {
            var expected = SearchFilters(tabHint: .events)
            expected.datePreset = preset
            XCTAssertEqual(dest("/events?preset=\(slug)"), .eventSearch(query: "", filters: expected), slug)
        }
    }

    func testSavedSearchAlertEmailLinkKeepsWordsAndArea() {
        // savedSearchMatch.ts deepLink(): q, location, preset, sort, then utm keys.
        let link = "/events?q=jazz&location=west-des-moines&preset=today&sort=date_asc"
            + "&utm_source=saved-search&utm_medium=email"
        var expected = SearchFilters(areas: [.westDesMoines], tabHint: .events)
        expected.datePreset = .today
        XCTAssertEqual(dest(link), .eventSearch(query: "jazz", filters: expected))
    }

    func testEventsLinkReadsTheOldSearchAliasAndAreaKey() {
        // ?search= is what the WebSite SearchAction advertised (WEB-SEO-029);
        // q wins when both are present, as on the web.
        XCTAssertEqual(dest("/events?search=trivia"), .eventSearch(query: "trivia", filters: SearchFilters(tabHint: .events)))
        XCTAssertEqual(dest("/events?q=jazz&search=trivia"), .eventSearch(query: "jazz", filters: SearchFilters(tabHint: .events)))
        XCTAssertEqual(
            dest("/events?area=ankeny"),
            .eventSearch(query: "", filters: SearchFilters(areas: [.ankeny], tabHint: .events))
        )
    }

    func testTonightWordsKeepTheTonightWindowOverTheSavedToday() {
        var expected = SearchFilters(tabHint: .events)
        expected.datePreset = .tonight
        XCTAssertEqual(dest("/events?q=live%20music%20tonight&preset=today"), .eventSearch(query: "live music tonight", filters: expected))
    }

    func testEventsLinkWithNoUsableFilterIsStillHome() {
        XCTAssertEqual(dest("/events"), .tab(.home))
        XCTAssertEqual(dest("/events?utm_source=share&sort=date_asc&view=map&page=2"), .tab(.home))
        // The controls' "no filter" values, an unknown category and preset,
        // an unknown area, a non-free price and a blank q.
        XCTAssertEqual(dest("/events?category=all&location=any-location&price=any-price"), .tab(.home))
        XCTAssertEqual(dest("/events?category=Underwater%20Basket&preset=someday&location=mars&price=under-25&q=%20"), .tab(.home))
    }

    func testEventsLinkQueryIsCapped() {
        let long = String(repeating: "a", count: 300)
        XCTAssertEqual(
            dest("/events?q=\(long)"),
            .eventSearch(query: String(repeating: "a", count: 120), filters: SearchFilters(tabHint: .events))
        )
    }

    func testFilteredEventsLinkIsRoutedNotJustParsed() {
        XCTAssertTrue(handler.handle(URL(string: "https://www.desmoinesinsider.com/events?price=free")!))
        XCTAssertEqual(handler.consumeDestination(), .eventSearch(query: "", filters: SearchFilters(freeOnly: true, tabHint: .events)))
    }

    func testSearchQueryIsCapped() {
        let long = String(repeating: "a", count: 300)
        XCTAssertEqual(dest("/search?q=\(long)"), .search(query: String(repeating: "a", count: 120)))
    }

    func testUnknownFirstPartyPageOpensOnTheWeb() {
        let url = URL(string: "https://desmoinesinsider.com/some-unknown-page")!
        XCTAssertEqual(handler.destination(for: url), .web(url))
        let bare = URL(string: "https://desmoinesinsider.com/attractions")!
        XCTAssertEqual(handler.destination(for: bare), .web(bare))
    }

    // MARK: - Exact host (IOS-DD-PLATFORM-10)

    func testLookAlikeHostsAndHttpAreRejected() {
        let id = "550e8400-e29b-41d4-a716-446655440000"
        XCTAssertNil(handler.destination(for: URL(string: "https://desmoinesinsider.com.attacker.net/events/\(id)")!))
        XCTAssertNil(handler.destination(for: URL(string: "https://evildesmoinesinsider.com/events/\(id)")!))
        XCTAssertNil(handler.destination(for: URL(string: "http://desmoinesinsider.com/events/\(id)")!))
    }

    func testHostMatchIgnoresCase() {
        let id = "550e8400-e29b-41d4-a716-446655440000"
        XCTAssertEqual(handler.destination(for: URL(string: "https://WWW.DesMoinesInsider.com/events/\(id)")!), .event(id: id))
    }

    func testAnArticleAboutAuthCallbacksIsNotAnAuthCallback() {
        XCTAssertTrue(handler.handle(URL(string: "https://desmoinesinsider.com/articles/auth-callback-explained")!))
        XCTAssertEqual(handler.consumeDestination(), .article(id: "auth-callback-explained"))
    }

    func testTheRealAuthCallbackIsLeftToSupabase() {
        XCTAssertFalse(handler.handle(URL(string: "\(Config.appBundleId)://auth-callback?code=x")!))
        XCTAssertNil(handler.consumeDestination())
    }
}
