import XCTest
@testable import DesMoinesInsider

/// IOS-DD-PLATFORM-01: the web's event slug, /events/<title>-<yyyy-mm-dd>,
/// built and resolved the way src/lib/timezone.ts and useEventBySlug.ts do.
final class EventSlugTests: XCTestCase {

    private func date(_ iso: String) -> Date {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        // swiftlint:disable:next force_unwrapping
        return f.date(from: iso)!
    }

    // MARK: - Building

    func testTitleSlug() {
        XCTAssertEqual(EventSlug.titleSlug("Jazz in the Park!"), "jazz-in-the-park")
        XCTAssertEqual(EventSlug.titleSlug("  --Rock & Roll--  "), "rock-roll")
        XCTAssertEqual(EventSlug.titleSlug(nil), "")
    }

    func testSlugUsesTheCentralDate() {
        // 01:30 UTC on the 15th is 20:30 CDT on the 14th.
        XCTAssertEqual(
            EventSlug.slug(title: "Late Show", start: date("2026-07-15T01:30:00Z")),
            "late-show-2026-07-14"
        )
    }

    func testSlugWithoutAStartIsTheTitle() {
        XCTAssertEqual(EventSlug.slug(title: "Late Show", start: nil), "late-show")
    }

    func testParseDateAndTitlePart() {
        let parsed = EventSlug.parseDate("jazz-in-the-park-2026-09-08")
        XCTAssertEqual(parsed?.y, 2026)
        XCTAssertEqual(parsed?.m, 9)
        XCTAssertEqual(parsed?.d, 8)
        XCTAssertEqual(EventSlug.titlePart("jazz-in-the-park-2026-09-08"), "jazz-in-the-park")
        XCTAssertNil(EventSlug.parseDate("jazz-in-the-park"))
    }

    // MARK: - Picking

    private let jazz = EventSlug.Candidate(id: "a1", title: "Jazz in the Park", start: nil)

    func testExactSlugIsPicked() {
        let row = EventSlug.Candidate(id: "a1", title: "Jazz in the Park", start: date("2026-09-08T23:00:00Z"))
        let other = EventSlug.Candidate(id: "b2", title: "Trivia Night", start: date("2026-09-08T23:00:00Z"))
        XCTAssertEqual(EventSlug.pick("jazz-in-the-park-2026-09-08", from: [other, row])?.id, "a1")
    }

    func testAStaleDateWithAUniqueTitleIsPicked() {
        // The event moved a day; the link still carries the old date.
        let moved = EventSlug.Candidate(id: "a1", title: "Jazz in the Park", start: date("2026-09-09T23:00:00Z"))
        XCTAssertEqual(EventSlug.pick("jazz-in-the-park-2026-09-08", from: [moved])?.id, "a1")
    }

    func testTwoSameTitleCandidatesAreAmbiguous() {
        let one = EventSlug.Candidate(id: "a1", title: "Jazz in the Park", start: date("2026-09-09T23:00:00Z"))
        let two = EventSlug.Candidate(id: "a2", title: "Jazz in the Park", start: date("2026-09-07T23:00:00Z"))
        XCTAssertNil(EventSlug.pick("jazz-in-the-park-2026-09-08", from: [one, two]))
    }

    func testARetitledRowOnTheSameDaySharingAWordIsPicked() {
        let retitled = EventSlug.Candidate(id: "a1", title: "Friday Jazz Showcase", start: date("2026-09-25T00:00:00Z"))
        XCTAssertEqual(EventSlug.pick("jazz-night-2026-09-24", from: [retitled])?.id, "a1")
    }

    func testARetitledRowSharingNoWordIsNotPicked() {
        let other = EventSlug.Candidate(id: "a1", title: "Pottery Class", start: date("2026-09-25T00:00:00Z"))
        XCTAssertNil(EventSlug.pick("jazz-night-2026-09-24", from: [other]))
    }

    func testADatelessSlugReturnsNil() {
        XCTAssertNil(EventSlug.pick("jazz-in-the-park", from: [jazz]))
    }

    // MARK: - Link segments

    func testLinkIdAcceptsUUIDsAndSlugs() {
        let uuid = "550e8400-e29b-41d4-a716-446655440000"
        XCTAssertEqual(EventSlug.linkId(uuid), uuid)
        XCTAssertEqual(EventSlug.linkId("jazz-in-the-park-2026-09-08"), "jazz-in-the-park-2026-09-08")
    }

    func testLinkIdRejectsLandingPagesMonthPagesAndJunk() {
        XCTAssertNil(EventSlug.linkId("today"))
        XCTAssertNil(EventSlug.linkId("west-des-moines"))
        XCTAssertNil(EventSlug.linkId("june-2026"))
        XCTAssertNil(EventSlug.linkId("Bad Slug"))
        XCTAssertNil(EventSlug.linkId("a--b"))
        XCTAssertNil(EventSlug.linkId(String(repeating: "a", count: 161)))
        XCTAssertNotNil(EventSlug.linkId(String(repeating: "a", count: 160)))
    }

    func testDayWindowSpansTheDayEitherSide() throws {
        let window = try XCTUnwrap(EventSlug.dayWindow((2026, 9, 8)))
        // Central midnight of Sep 7 and Sep 10 (CDT, UTC-5).
        XCTAssertEqual(window.from, date("2026-09-07T05:00:00Z"))
        XCTAssertEqual(window.to, date("2026-09-10T05:00:00Z"))
    }

    // MARK: - Clip date text (IOS-DD-PLATFORM-04)

    func testClipDateIsCentralTime() {
        // 19:00 UTC is 2:00 PM CDT.
        let text = ClipDateFormat.displayDate("2026-09-28T19:00:00+00:00", timeTbd: nil)
        XCTAssertTrue(text.contains("Sep"), text)
        XCTAssertTrue(text.contains("28"), text)
        XCTAssertTrue(text.contains("2:00"), text)
        XCTAssertFalse(text.contains("Time TBA"), text)
    }

    func testClipDateMarksTheNoTimeMarkerAsTBA() {
        // 00:31:58 UTC on the 29th is 19:31:58 CDT on the 28th, the ingest's
        // "no start time" marker.
        let text = ClipDateFormat.displayDate("2026-09-29T00:31:58+00:00", timeTbd: nil)
        XCTAssertTrue(text.hasSuffix(" - Time TBA"), text)
        XCTAssertTrue(text.contains("28"), text)
    }

    func testClipDateHonoursTimeTbd() {
        XCTAssertTrue(ClipDateFormat.displayDate("2026-09-28T19:00:00Z", timeTbd: true).hasSuffix(" - Time TBA"))
    }

    func testClipDateNeverShowsTheRawValue() {
        XCTAssertEqual(ClipDateFormat.displayDate("not a date", timeTbd: nil), "Date TBA")
    }

    func testClipDateParsesFractionalSeconds() {
        XCTAssertNotNil(ClipDateFormat.parse("2026-09-28T19:00:00.123Z"))
    }
}
