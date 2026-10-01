import XCTest
@testable import DesMoinesInsider

/// IOS-DD-EVENTS-07: areas as the web defines them (src/lib/eventAreas.ts).
final class EventAreaTests: XCTestCase {

    func testDowntownIsItsBoundingBox() {
        XCTAssertEqual(
            LocationArea.downtown.filterClause,
            "and(latitude.gte.41.579,latitude.lte.41.596,longitude.gte.-93.6425,longitude.lte.-93.617)"
        )
    }

    func testDesMoinesIsAnExactCityMatchOnly() {
        let clause = LocationArea.desMoines.filterClause
        XCTAssertEqual(clause, "city.ilike.Des Moines")
        XCTAssertFalse(clause.contains("location."))
    }

    func testSuburbFallsBackToALocationEndingInTheCity() {
        // eventAreaOrFilter for Ankeny.
        XCTAssertEqual(
            LocationArea.ankeny.filterClause,
            #"city.ilike.Ankeny,and(city.is.null,or(location.ilike."%, Ankeny",location.ilike."%, Ankeny, IA%",location.ilike."%, Ankeny, Iowa%"))"#
        )
    }

    func testAreasAreInTheWebsOrder() {
        XCTAssertEqual(LocationArea.allCases.first, .desMoines)
        XCTAssertEqual(LocationArea.allCases.count, 13)
    }

    func testPostgrestQuotedEscapesQuoteAndBackslashOnly() {
        let quoted = EventsService.postgrestQuoted(#"a,b)%_"\"#)
        // PostgREST reads \X inside quotes as X, so this reaches Postgres as
        // the original text.
        XCTAssertEqual(quoted, #""a,b)%_\"\\""#)
    }

    func testIlikeContainsSurvivesPostgRESTUnquoting() {
        // LIKE-escaped (\%) then quote-escaped (\\%): PostgREST strips one
        // level and Postgres receives \%, a literal percent sign.
        XCTAssertEqual(EventsService.ilikeContains("50%_off"), #""%50\\%\\_off%""#)
        XCTAssertEqual(EventsService.ilikeContains(#"say "hi""#), #""%say \"hi\"%""#)
    }
}
