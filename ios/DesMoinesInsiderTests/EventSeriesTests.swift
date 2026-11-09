import XCTest
@testable import DesMoinesInsider

/// IOS-AUDIT-FEAT-046: the web's annual event series (src/lib/eventSeries.ts)
/// ported to iOS. The list itself is checked against the web by vitest
/// (src/lib/__tests__/iosEventSeriesParity.test.ts), which also runs every
/// pair in `normaliseCases` through the web's normaliseEventTitle, so the
/// expectations below are the web's answers, not this port's.
final class EventSeriesTests: XCTestCase {

    /// (title, normalised). Parsed by iosEventSeriesParity.test.ts: keep one
    /// pair per line, plain string literals only.
    static let normaliseCases: [(String, String)] = [
        ("11th Annual Cloris Awards", "cloris awards"),
        ("Hinterland 2026 Music Festival", "hinterland music festival"),
        ("Jazz in July 2026: Night 3", "jazz in july night 3"),
        ("22nd Annual Des Moines' Original Oktoberfest", "des moines original oktoberfest"),
        ("Des Moines\u{2019} Original Oktoberfest", "des moines original oktoberfest"),
        ("2026 Taylor Fest - (6/19)", "taylor fest"),
        ("Forever in Love: Bridal Show, Sept 13", "forever in love bridal show"),
        ("Beaverdale Fall Festival 2025-26", "beaverdale fall festival"),
        ("Panda Fest 3rd Edition", "panda fest"),
        ("Jazz in July", "jazz in july"),
        ("25th Anniversary Tour", "anniversary tour"),
        ("Band 25th Anniversary Tour", "band 25th anniversary tour"),
        ("Rock &amp; Roll Revue", "rock roll revue"),
        ("", ""),
    ]

    func testNormaliseTitleMatchesTheWebCases() {
        for (title, expected) in Self.normaliseCases {
            XCTAssertEqual(EventSeries.normaliseTitle(title), expected, title)
        }
        XCTAssertEqual(EventSeries.normaliseTitle(nil), "")
    }

    func testLookupBySlug() {
        XCTAssertEqual(EventSeries.series(slug: "panda-fest")?.name, "Panda Fest")
        XCTAssertNil(EventSeries.series(slug: "not-a-series"))
        XCTAssertNil(EventSeries.series(slug: ""))
        XCTAssertNil(EventSeries.series(slug: nil))
    }

    func testPathIsTheWebURL() throws {
        let def = try XCTUnwrap(EventSeries.series(slug: "cloris-awards"))
        XCTAssertEqual(EventSeries.path(def), "/events/series/cloris-awards")
    }

    func testEditionsJoinTheirSeriesByTitle() {
        XCTAssertEqual(EventSeries.series(title: "11th Annual Cloris Awards")?.slug, "cloris-awards")
        XCTAssertEqual(EventSeries.series(title: "PandaFest 2026")?.slug, "panda-fest")
        // Alias plus a word: a night of a multi-night run still belongs.
        XCTAssertEqual(
            EventSeries.series(title: "Jazz in July 2026: Night 3", venue: "Hoyt Sherman Place")?.slug,
            "jazz-in-july"
        )
        // A longer word that merely starts with the alias does not.
        XCTAssertNil(EventSeries.series(title: "Farmstasiana"))
        XCTAssertNil(EventSeries.series(title: "Some Other Concert"))
        XCTAssertNil(EventSeries.series(title: nil))
    }

    func testVenueQualifiedSeriesNeedTheVenue() {
        XCTAssertNil(EventSeries.series(title: "Pumpkin Fest 2026"))
        XCTAssertNil(EventSeries.series(title: "Pumpkin Fest 2026", venue: "Some Other Farm"))
        XCTAssertEqual(
            EventSeries.series(title: "Pumpkin Fest 2026", venue: "Center Grove Orchard")?.slug,
            "center-grove-orchard-pumpkin-fest"
        )
        // The location counts as well as the venue.
        XCTAssertEqual(
            EventSeries.series(title: "Family Halloween", location: "Living History Farms, Urbandale")?.slug,
            "living-history-farms-family-halloween"
        )
    }

    func testTitlePatternsJoinAliasWordsWithWildcards() throws {
        let def = try XCTUnwrap(EventSeries.series(slug: "panda-fest"))
        XCTAssertEqual(EventSeries.titlePatterns(def), ["title.ilike.*panda*fest*", "title.ilike.*pandafest*"])
    }

    func testListIsSafeToPutInAFilterAndInAURL() {
        XCTAssertEqual(Set(EventSeries.all.map(\.slug)).count, EventSeries.all.count, "duplicate slug")
        for def in EventSeries.all {
            XCTAssertNotNil(def.slug.range(of: "^[a-z0-9]+(-[a-z0-9]+)*$", options: .regularExpression), def.slug)
            for alias in def.aliases {
                // Aliases go into a PostgREST or() filter unescaped.
                XCTAssertNotNil(alias.range(of: "^[a-z0-9 ]+$", options: .regularExpression), alias)
                XCTAssertEqual(EventSeries.normaliseTitle(alias), alias, "alias is not normalised: \(alias)")
            }
        }
    }
}
