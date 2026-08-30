import XCTest
@testable import DesMoinesInsider

/// Pure-config coverage for IOS-PARITY-006. The networked hub loads + SwiftUI
/// screens run in the CI macOS build; these lock the curation config (event
/// terms, attraction types), the Discover→hub mapping, and the neighborhood
/// area-matching used to filter listings.
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
            XCTAssertFalse(hub.eventTerms.isEmpty, "\(hub) needs event terms")
            XCTAssertFalse(hub.title.isEmpty)
            XCTAssertFalse(hub.blurb.isEmpty)
        }
    }

    func testHubEventAndAttractionTermsAreFaithful() {
        XCTAssertTrue(ContentHub.music.eventTerms.contains("Concert"))
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

    func testNeighborhoodMatchesLocationCaseInsensitively() {
        let ankeny = Neighborhood.bySlug("ankeny")!
        XCTAssertTrue(ankeny.matches("123 Main St, Ankeny, IA"))
        XCTAssertTrue(ankeny.matches("ANKENY"))
        XCTAssertFalse(ankeny.matches("Des Moines"))
        XCTAssertFalse(ankeny.matches(nil))
        XCTAssertFalse(ankeny.matches(""))
    }

    func testEveryNeighborhoodHasUniqueSlug() {
        let slugs = Neighborhood.all.map(\.slug)
        XCTAssertEqual(Set(slugs).count, slugs.count)
    }
}
