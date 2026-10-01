import XCTest
@testable import DesMoinesInsider

/// Pure-config coverage for IOS-PARITY-006. The networked hub loads + SwiftUI
/// screens run in the CI macOS build; these lock the curation config (event
/// or-groups, attraction types), the Discover→hub mapping, and the
/// Tonight / weekend / later split (IOS-DD-BROWSE-22 / 23). Neighborhood
/// matching moved server-side; see NeighborhoodTests.
final class ContentHubTests: XCTestCase {

    // MARK: Content hub config

    func testHubsMapFromDiscoverDestinations() {
        XCTAssertEqual(ContentHub(destination: .music), .music)
        XCTAssertEqual(ContentHub(destination: .sports), .sports)
        XCTAssertEqual(ContentHub(destination: .outdoors), .outdoors)
        // Non-hub destinations don't map.
        XCTAssertNil(ContentHub(destination: .stay))
        XCTAssertNil(ContentHub(destination: .neighborhoods))
    }

    func testEachHubHasCurationConfig() {
        for hub in ContentHub.allCases {
            XCTAssertFalse(hub.eventOrGroup.isEmpty, "\(hub) needs an event or-group")
            XCTAssertFalse(hub.title.isEmpty)
            XCTAssertFalse(hub.blurb.isEmpty)
        }
    }

    func testHubEventAndAttractionTermsAreFaithful() {
        XCTAssertEqual(ContentHub.music.eventOrGroup, "category.eq.Music")
        XCTAssertEqual(ContentHub.sports.eventOrGroup, "category.eq.Sports")
        XCTAssertTrue(ContentHub.outdoors.eventOrGroup.contains("category.eq.Outdoor"))
        XCTAssertTrue(ContentHub.outdoors.eventOrGroup.contains("is_indoor.not.is.true"))
        // A backend without events.is_indoor still gets an Outdoors query.
        XCTAssertEqual(ContentHub.outdoors.eventOrGroupWithoutIndoorFlag, "category.in.(Outdoor,Festival,Markets)")
        XCTAssertNil(ContentHub.music.eventOrGroupWithoutIndoorFlag)
        XCTAssertEqual(ContentHub.sports.attractionTypes, [.sports])
        XCTAssertEqual(ContentHub.outdoors.attractionTypes, [.park, .garden, .zoo])
        // Attraction type raw values are what the query filters on.
        XCTAssertEqual(ContentHub.outdoors.attractionTypes.map(\.rawValue), ["Park", "Garden", "Zoo"])
    }

    // MARK: Neighborhoods

    func testNeighborhoodCatalogIsNonEmptyAndLookupWorks() {
        XCTAssertFalse(Neighborhood.all.isEmpty)
        XCTAssertEqual(Neighborhood.bySlug("east-village")?.name, "East Village")
        XCTAssertNil(Neighborhood.bySlug("nope"))
    }

    func testEveryNeighborhoodHasUniqueSlug() {
        let slugs = Neighborhood.all.map(\.slug)
        XCTAssertEqual(Set(slugs).count, slugs.count)
    }

    // MARK: Honest copy (IOS-DD-BROWSE-21)

    func testMusicBlurbPromisesOnlyWhatTheScreenHas() {
        XCTAssertFalse(ContentHub.music.blurb.contains("venue guides"))
        for hub in ContentHub.allCases {
            XCTAssertEqual(hub.diningSectionTitle, "Featured dining")
        }
    }

    // MARK: Tonight / weekend / later (IOS-DD-BROWSE-23)

    private func ct(_ day: Int, _ hour: Int) -> Date {
        DesMoinesTime.calendar.date(from: DateComponents(year: 2026, month: 9, day: day, hour: hour))!
    }

    private func event(_ id: String, start: Date, end: Date? = nil) -> Event {
        var e = Event(id: id, title: id, date: DateParser.toISO(start))
        e.endDate = end.map { DateParser.toISO($0) }
        return e
    }

    func testPartitionOnWednesdayEvening() {
        // 2026-09-30 is a Wednesday; its weekend is Oct 2-4.
        let now = ct(30, 18)
        let tonight = event("tonight", start: ct(30, 20))
        let saturday = event("saturday", start: DesMoinesTime.calendar.date(from: DateComponents(year: 2026, month: 10, day: 3, hour: 14))!)
        let tuesday = event("tuesday", start: DesMoinesTime.calendar.date(from: DateComponents(year: 2026, month: 10, day: 6, hour: 19))!)
        let ended = event("ended", start: ct(30, 10), end: ct(30, 12))

        let parts = ContentHub.partition([tonight, saturday, tuesday, ended], now: now)
        XCTAssertEqual(parts.tonight.map(\.id), ["tonight"])
        XCTAssertEqual(parts.weekend.map(\.id), ["saturday"])
        XCTAssertEqual(parts.later.map(\.id), ["tuesday"])
    }

    func testSaturdayNightShowIsTonightNotWeekend() {
        // 2026-09-26 is a Saturday.
        let parts = ContentHub.partition([event("late", start: ct(26, 21))], now: ct(26, 19))
        XCTAssertEqual(parts.tonight.map(\.id), ["late"])
        XCTAssertTrue(parts.weekend.isEmpty)
    }
}
