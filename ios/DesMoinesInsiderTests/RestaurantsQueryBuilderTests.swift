import XCTest
@testable import DesMoinesInsider

/// IOS-DD-RESTAURANTS-03 / 04 / 05 / 07: how a Dining query becomes a
/// PostgREST request, checked on the pure helpers the service uses.
final class RestaurantsQueryBuilderTests: XCTestCase {

    typealias Service = RestaurantsService
    typealias Query = RestaurantsService.RestaurantsQuery

    // MARK: - Prefix search (hubSearchQuery)

    func testPrefixSearch() {
        XCTAssertEqual(Service.prefixTsQuery("harb")?.query, "harb:*")
        XCTAssertEqual(Service.prefixTsQuery("harb")?.websearch, false)
        XCTAssertEqual(Service.prefixTsQuery("zombie burger")?.query, "zombie & burger:*")
        XCTAssertEqual(Service.prefixTsQuery("joe's (tacos)")?.query, "joe & s & tacos:*")
    }

    func testQuotesGoToWebsearch() {
        let q = Service.prefixTsQuery("\"exact phrase\"")
        XCTAssertEqual(q?.websearch, true)
        XCTAssertEqual(q?.query, "\"exact phrase\"")
        XCTAssertEqual(Service.prefixTsQuery("tacos OR burgers")?.websearch, true)
    }

    func testBlankSearchIsNil() {
        XCTAssertNil(Service.prefixTsQuery("   "))
    }

    // MARK: - Rotation seed

    private func utc(_ iso: String) -> Date {
        ISO8601DateFormatter().date(from: iso)!
    }

    func testRotationSeedFollowsTheCentralDay() {
        let evening = Service.rotationSeed(now: utc("2026-09-27T23:30:00Z"))   // 18:30 CDT on the 27th
        let lateNight = Service.rotationSeed(now: utc("2026-09-28T04:30:00Z")) // 23:30 CDT on the 27th
        let afterMidnight = Service.rotationSeed(now: utc("2026-09-28T05:30:00Z")) // 00:30 CDT on the 28th
        XCTAssertEqual(evening, lateNight)
        XCTAssertEqual(afterMidnight, evening + 1)
    }

    // MARK: - Missing-function fallback

    /// Shaped like PostgrestError: a `code` field.
    private struct CodedError: Error {
        let code: String?
        let message = ""
    }

    func testOnlyAMissingFunctionFallsBack() {
        XCTAssertTrue(Service.isMissingFunctionError(CodedError(code: "PGRST202")))
        XCTAssertTrue(Service.isMissingFunctionError(CodedError(code: "42883")))
        XCTAssertFalse(Service.isMissingFunctionError(CodedError(code: "57014")))
        XCTAssertFalse(Service.isMissingFunctionError(URLError(.timedOut)))
    }

    // MARK: - Unvisitable rows last

    func testDeprioritizeKeepsOrderWithinEachBand() {
        func row(_ id: String, _ status: String?, business: String? = nil) -> Restaurant {
            var r = Restaurant(id: id, name: id)
            r.status = status
            r.businessStatus = business
            return r
        }
        let rows = [
            row("closed1", "closed"),
            row("open1", "open"),
            row("soon1", "opening_soon"),
            row("open2", nil),
            row("gone", "open", business: "CLOSED_PERMANENTLY"),
            row("new1", "newly_opened"),
            row("soon2", "announced"),
        ]
        XCTAssertEqual(
            Service.deprioritizeUnvisitable(rows).map(\.id),
            ["open1", "open2", "new1", "soon1", "soon2", "closed1", "gone"]
        )
    }

    // MARK: - Which path

    func testRotationRPCOnlyForAPlainPopularityList() {
        var q = Query()
        XCTAssertTrue(Service.usesRotationRPC(q))
        q.searchText = "harb"
        XCTAssertFalse(Service.usesRotationRPC(q), "a search takes the prefix-search table path")

        q = Query()
        q.dietary = ["vegan"]
        XCTAssertFalse(Service.usesRotationRPC(q))

        q = Query()
        q.statuses = ["opening_soon"]
        XCTAssertFalse(Service.usesRotationRPC(q))

        q = Query()
        q.sortBy = .rating
        XCTAssertFalse(Service.usesRotationRPC(q))
    }

    // MARK: - Dietary (DIETARY_KEYWORDS)

    func testVeganOrGroup() {
        XCTAssertEqual(
            Service.dietaryOrGroup(["vegan"]),
            #"description.ilike."%vegan%",cuisine.ilike."%vegan%",name.ilike."%vegan%""#
        )
    }

    func testGlutenFreeKeepsItsHyphenAndAddsNoStrayWildcard() {
        let group = Service.dietaryOrGroup(["gluten-free"]) ?? ""
        XCTAssertTrue(group.contains(#"name.ilike."%gluten-free%""#))
        XCTAssertTrue(group.contains(#"name.ilike."%gluten free%""#))
        XCTAssertTrue(group.contains(#"name.ilike."%celiac%""#))
        XCTAssertFalse(group.contains("%%"))
    }

    func testUnknownDietIsDropped() {
        XCTAssertNil(Service.dietaryOrGroup(["paleo"]))
    }

    // MARK: - Areas (LocationArea)

    func testAreasBecomeOneOrGroupAndForceTheTablePath() {
        var q = Query()
        q.locations = ["East Village", "Ankeny"]
        XCTAssertEqual(
            Service.orGroups(for: q),
            [LocationArea.eastVillage.filterClause + "," + LocationArea.ankeny.filterClause]
        )
        XCTAssertFalse(Service.usesRotationRPC(q))
    }

    func testALegacyAddressIsNotAnArea() {
        var q = Query()
        q.locations = ["100 Main St"]
        XCTAssertEqual(Service.orGroups(for: q), [])
        XCTAssertTrue(Service.usesRotationRPC(q))
        XCTAssertEqual(Service.splitLocations(q.locations).legacy, ["100 Main St"])
    }

    func testDietaryAndAreaNestIntoOneOrParam() {
        var q = Query()
        q.locations = ["Ankeny"]
        q.dietary = ["vegan"]
        let groups = Service.orGroups(for: q)
        XCTAssertEqual(groups.count, 2)
        XCTAssertEqual(
            EventsService.combineOrGroups(groups),
            "and(or(\(groups[0])),or(\(groups[1])))"
        )
    }
}
