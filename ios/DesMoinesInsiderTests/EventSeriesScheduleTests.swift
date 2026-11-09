import XCTest
@testable import DesMoinesInsider

/// IOS-AUDIT-FEAT-046 slice 2: the web's series selection rules
/// (src/lib/eventSeriesView.ts) ported to `EventSeriesSchedule`. Each case is
/// a case from src/lib/__tests__/eventSeriesView.test.ts with the same rows,
/// the same clock and the web's expected answer, so a divergence here is a
/// divergence from the web page.
final class EventSeriesScheduleTests: XCTestCase {

    /// 15:00 UTC on 2026-10-01, the web test's NOW.
    private let now = DateParser.parse("2026-10-01T15:00:00Z")!

    private var nextId = 0

    /// 23:00 UTC is 6 pm Central the same day, as in the web test's row().
    private func row(
        _ title: String,
        _ day: String,
        venue: String? = "Venue",
        isHidden: Bool = false,
        hiddenAt: String? = nil,
        archivedAt: String? = nil,
        endDate: String? = nil,
        timeTbd: Bool? = nil
    ) -> SeriesEventRow {
        nextId += 1
        var event = Event(id: "id-\(nextId)", title: title, date: "\(day)T23:00:00+00:00")
        event.eventStartUtc = event.date
        event.venue = venue
        event.city = "Des Moines"
        event.endDate = endDate
        event.timeTbd = timeTbd
        return SeriesEventRow(event: event, isHidden: isHidden, hiddenAt: hiddenAt, archivedAt: archivedAt)
    }

    private func series(_ slug: String) throws -> EventSeriesDef {
        try XCTUnwrap(EventSeries.series(slug: slug))
    }

    func testPicksTheEditionStillToComeAndListsEarlierYearsNewestFirst() throws {
        let schedule = EventSeriesSchedule.build(try series("cloris-awards"), rows: [
            row("10th Annual Cloris Awards", "2025-08-31", isHidden: true, hiddenAt: "2025-09-10T00:00:00Z"),
            row("11th Annual Cloris Awards", "2026-08-30", isHidden: true, hiddenAt: "2026-09-10T00:00:00Z"),
            row("12th Annual Cloris Awards", "2027-08-29"),
        ], now: now)
        XCTAssertEqual(schedule.current?.year, 2027)
        XCTAssertEqual(schedule.past.map(\.year), [2026, 2025])
        XCTAssertNil(schedule.unannouncedYear)
        XCTAssertEqual(schedule.total, 3)
    }

    func testNextYearIsUnannouncedWhenEveryEditionIsOver() throws {
        let rows = ["07", "14", "21", "28"].map { d in
            row("Jazz in July 2026: Night \(d)", "2026-07-\(d)", venue: "Hoyt Sherman Place",
                isHidden: true, hiddenAt: "2026-08-05T00:00:00Z")
        }
        let schedule = EventSeriesSchedule.build(try series("jazz-in-july"), rows: rows, now: now)
        XCTAssertNil(schedule.current)
        XCTAssertEqual(schedule.unannouncedYear, 2027)
        XCTAssertEqual(schedule.past.first?.instances.count, 4)
        XCTAssertEqual(schedule.past.first?.firstDay, "2026-07-07")
        XCTAssertEqual(schedule.past.first?.lastDay, "2026-07-28")
        XCTAssertEqual(schedule.venue, "Hoyt Sherman Place")
    }

    func testNeverNamesAPastYearAsUnannounced() throws {
        let schedule = EventSeriesSchedule.build(try series("cloris-awards"), rows: [
            row("Cloris Awards", "2024-08-30", isHidden: true, hiddenAt: "2024-09-10T00:00:00Z"),
        ], now: now)
        XCTAssertEqual(schedule.unannouncedYear, 2026)
    }

    func testLinksLiveListsSweptAndDropsModeratorHidden() throws {
        let swept = row("Panda Fest 2025", "2025-10-03", isHidden: true, hiddenAt: "2025-10-12T08:00:00Z")
        let takenDown = row("Panda Fest 2025", "2025-10-04", isHidden: true, hiddenAt: "2025-09-01T08:00:00Z")
        let live = row("Panda Fest 2026", "2026-10-02")
        let schedule = EventSeriesSchedule.build(try series("panda-fest"), rows: [swept, takenDown, live], now: now)

        XCTAssertTrue(EventSeriesSchedule.isModeratorHidden(takenDown))
        XCTAssertFalse(EventSeriesSchedule.isModeratorHidden(swept))
        XCTAssertEqual(schedule.current?.instances.first?.linkId, live.event.id)
        XCTAssertEqual(schedule.past.first?.instances.map(\.day), ["2025-10-03"])
        XCTAssertEqual(schedule.past.first?.instances.map(\.linkId), [nil])
    }

    func testHiddenWithoutAHiddenAtCountsAsAModerator() {
        let unknown = row("Panda Fest 2025", "2025-10-03", isHidden: true, hiddenAt: nil)
        XCTAssertTrue(EventSeriesSchedule.isModeratorHidden(unknown))
        XCTAssertFalse(EventSeriesSchedule.isModeratorHidden(row("Panda Fest 2026", "2026-10-02")))
    }

    func testArchivedIsListedAndLinkedButNeverCurrent() throws {
        let archived = row("Panda Fest 2026", "2026-10-02", archivedAt: "2026-09-30T00:00:00Z")
        let schedule = EventSeriesSchedule.build(try series("panda-fest"), rows: [archived], now: now)
        XCTAssertNil(schedule.current)
        XCTAssertEqual(schedule.past.first?.instances.first?.linkId, archived.event.id)
    }

    func testOneRowPerDayPreferringLiveThenTheShorterTitle() throws {
        let schedule = EventSeriesSchedule.build(try series("hinterland-music-festival"), rows: [
            row("Hinterland Music Festival (4 Day Pass) with KATSEYE, Lorde", "2027-07-29"),
            row("Hinterland 2027 Music Festival", "2027-07-29"),
            row("Hinterland Music Festival (Friday Pass) with Lorde", "2027-07-30"),
        ], now: now)
        XCTAssertEqual(schedule.current?.instances.map(\.row.event.title), [
            "Hinterland 2027 Music Festival",
            "Hinterland Music Festival (Friday Pass) with Lorde",
        ])
        XCTAssertEqual(schedule.total, 2)
    }

    func testALiveRowBeatsASweptRowOnTheSameDay() throws {
        let swept = row("Panda Fest", "2026-10-02", isHidden: true, hiddenAt: "2026-10-12T00:00:00Z")
        let live = row("Panda Fest 2026 with a much longer title", "2026-10-02")
        let schedule = EventSeriesSchedule.build(try series("panda-fest"), rows: [swept, live], now: now)
        XCTAssertEqual(schedule.current?.instances.map(\.id), [live.event.id])
    }

    func testIgnoresRowsTheLooseDatabaseFilterLetThrough() throws {
        let schedule = EventSeriesSchedule.build(try series("beaverdale-fall-festival"), rows: [
            row("Beaverdale Fall Festival", "2026-09-18"),
            row("Backyard BBQ Contest at Beaverdale Fall Festival", "2026-09-19"),
        ], now: now)
        XCTAssertEqual(schedule.total, 1)
    }

    func testRunsAnEditionToItsEndDate() throws {
        let schedule = EventSeriesSchedule.build(try series("center-grove-orchard-pumpkin-fest"), rows: [
            row("Pumpkin Fest", "2026-10-01", venue: "Center Grove Orchard",
                endDate: "2026-11-07T05:59:00+00:00", timeTbd: true),
        ], now: now)
        XCTAssertEqual(schedule.current?.firstDay, "2026-10-01")
        XCTAssertEqual(schedule.current?.lastDay, "2026-11-06")
    }

    // MARK: - Labels (slice 3), the web test's own answers

    func testEditionDateLabelMatchesTheWeb() throws {
        let rows = ["07", "14", "21", "28"].map { d in
            row("Jazz in July 2026: Night \(d)", "2026-07-\(d)", venue: "Hoyt Sherman Place",
                isHidden: true, hiddenAt: "2026-08-05T00:00:00Z")
        }
        let schedule = EventSeriesSchedule.build(try series("jazz-in-july"), rows: rows, now: now)
        let edition = try XCTUnwrap(schedule.past.first)
        XCTAssertEqual(EventSeriesSchedule.editionDateLabel(edition), "Tuesday, July 7 to Tuesday, July 28, 2026")
        XCTAssertEqual(EventSeriesSchedule.unannouncedLabel(try XCTUnwrap(schedule.unannouncedYear)),
                       "2027 date not announced yet")
    }

    func testEditionDateLabelForOneDayAndAcrossAYear() {
        let one = SeriesEdition(year: 2026, instances: [], venues: [], firstDay: "2026-10-02", lastDay: "2026-10-02")
        XCTAssertEqual(EventSeriesSchedule.editionDateLabel(one), "Friday, October 2, 2026")
        let span = SeriesEdition(year: 2026, instances: [], venues: [], firstDay: "2026-12-31", lastDay: "2027-01-01")
        XCTAssertEqual(EventSeriesSchedule.editionDateLabel(span), "Thursday, December 31, 2026 to Friday, January 1, 2027")
        XCTAssertEqual(EventSeriesSchedule.dayWords("2026-10-02", pattern: "EEE, MMM d"), "Fri, Oct 2")
    }

    func testNoRowsIsAnUnannouncedThisYear() throws {
        let schedule = EventSeriesSchedule.build(try series("eerie-evenings"), rows: [], now: now)
        XCTAssertNil(schedule.current)
        XCTAssertEqual(schedule.past, [])
        XCTAssertEqual(schedule.unannouncedYear, 2026)
        XCTAssertNil(schedule.venue)
        XCTAssertEqual(schedule.total, 0)
    }

    func testDecodesTheSwitchesAlongsideTheEventAndDropsABadRow() throws {
        let json = """
        [
          {"id": "a", "title": "Panda Fest 2025", "date": "2025-10-03T23:00:00+00:00",
           "is_hidden": true, "hidden_at": "2025-10-12T08:00:00Z", "archived_at": null},
          {"id": "b", "title": "Panda Fest 2026", "date": "2026-10-02T23:00:00+00:00"},
          {"title": "no id"}
        ]
        """
        let rows = try JSONDecoder().decode(LossySeriesRows.self, from: Data(json.utf8)).rows
        XCTAssertEqual(rows.map(\.event.id), ["a", "b"])
        XCTAssertEqual(rows.first?.isHidden, true)
        XCTAssertEqual(rows.first?.hiddenAt, "2025-10-12T08:00:00Z")
        XCTAssertNil(rows.last?.isHidden)
        XCTAssertTrue(rows.last?.isLive ?? false)
    }
}
