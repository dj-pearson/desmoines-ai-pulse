import XCTest
import CoreLocation
@testable import DesMoinesInsider

/// IOS-AUDIT-PERF-024 -- the query normalisation and the cache behind it.
///
/// CLGeocoder cannot be exercised from a unit test, so what is covered is the
/// part that decides whether a request goes out at all. The normalised query is
/// BOTH the address sent and the cache key, so a change to it silently misses
/// every cached entry and the batch runs again - which is the defect this story
/// is about, reintroduced by a refactor rather than by the original code.
@MainActor
final class TripGeocodeCacheTests: XCTestCase {

    override func setUp() {
        super.setUp()
        TripGeocodeCache.reset()
    }

    override func tearDown() {
        TripGeocodeCache.reset()
        super.tearDown()
    }

    private let downtown = CLLocationCoordinate2D(latitude: 41.5868, longitude: -93.6250)

    // MARK: - Query normalisation

    func testABareStreetGetsTheCityAndState() {
        // "Court Avenue" alone is ambiguous worldwide.
        XCTAssertEqual(
            TripGeocodeCache.normalizedQuery(for: "Court Avenue"),
            "Court Avenue, Des Moines, IA"
        )
    }

    func testAnAddressThatAlreadyNamesTheCityIsLeftAlone() {
        // Appending again produces "... Des Moines, IA, Des Moines, IA", which
        // the geocoder resolves to nothing.
        let address = "1000 Walnut St, Des Moines, IA 50309"
        XCTAssertEqual(TripGeocodeCache.normalizedQuery(for: address), address)
    }

    func testTheCityCheckIsCaseInsensitive() {
        XCTAssertEqual(
            TripGeocodeCache.normalizedQuery(for: "100 Locust St, DES MOINES"),
            "100 Locust St, DES MOINES"
        )
    }

    func testSurroundingWhitespaceIsTrimmedBeforeItBecomesAKey() {
        // Otherwise " Court Avenue" and "Court Avenue" are two cache entries and
        // two requests for one address.
        XCTAssertEqual(
            TripGeocodeCache.normalizedQuery(for: "  Court Avenue  "),
            TripGeocodeCache.normalizedQuery(for: "Court Avenue")
        )
    }

    // MARK: - Cache

    func testAnUnknownQueryIsAMiss() {
        XCTAssertNil(TripGeocodeCache.cached("Court Avenue, Des Moines, IA"))
    }

    func testAStoredCoordinateComesBack() {
        let query = TripGeocodeCache.normalizedQuery(for: "Court Avenue")
        TripGeocodeCache.store(downtown, for: query)

        let cached = TripGeocodeCache.cached(query)
        XCTAssertEqual(cached?.latitude, downtown.latitude)
        XCTAssertEqual(cached?.longitude, downtown.longitude)
    }

    func testTheSameStopSpelledWithStrayWhitespaceHitsTheSameEntry() {
        TripGeocodeCache.store(downtown, for: TripGeocodeCache.normalizedQuery(for: "Court Avenue"))
        XCTAssertNotNil(TripGeocodeCache.cached(TripGeocodeCache.normalizedQuery(for: " Court Avenue ")))
        XCTAssertEqual(TripGeocodeCache.count, 1)
    }

    func testStoringTheSameQueryTwiceDoesNotGrowTheCache() {
        let query = TripGeocodeCache.normalizedQuery(for: "Court Avenue")
        TripGeocodeCache.store(downtown, for: query)
        TripGeocodeCache.store(downtown, for: query)
        XCTAssertEqual(TripGeocodeCache.count, 1)
    }

    func testResetEmptiesIt() {
        TripGeocodeCache.store(downtown, for: "anything")
        TripGeocodeCache.reset()
        XCTAssertEqual(TripGeocodeCache.count, 0)
    }
}
