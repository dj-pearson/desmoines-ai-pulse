import UniformTypeIdentifiers
import XCTest
@testable import DesMoinesInsider

/// XPLAT-007 (iOS half): how Settings > Export My Data reads export-user-data.
/// Mirrors the Android classification tests so both apps treat the same
/// answers the same way.
@MainActor
final class DataExportTests: XCTestCase {

    private let export = #"""
    {"exportedAt":"2026-11-07T18:00:00.000Z","userId":"u1","email":"a@b.c",
     "data":{"profiles":[{"id":"u1"}],"event_rsvps":[{"id":"r1"}]},
     "tablesConsidered":80,"tablesWithData":2,"retentionBasis":{},"unavailable":[]}
    """#

    func testNotDeployedIsItsOwnOutcome() {
        XCTAssertEqual(DataExportService.classify(status: 404, body: Data()), .notAvailable)
    }

    func testExpiredSessionIsItsOwnOutcome() {
        XCTAssertEqual(
            DataExportService.classify(status: 401, body: Data(#"{"error":"Invalid authentication"}"#.utf8)),
            .notSignedIn
        )
    }

    func testServerErrorFails() {
        XCTAssertEqual(
            DataExportService.classify(status: 500, body: Data(#"{"error":"boom"}"#.utf8)),
            .failed(status: 500)
        )
    }

    func testRealExportIsReadyWithCounts() throws {
        guard case let .ready(json, withData, considered, unavailable) =
                DataExportService.classify(status: 200, body: Data(export.utf8)) else {
            return XCTFail("expected a ready export")
        }
        XCTAssertEqual(withData, 2)
        XCTAssertEqual(considered, 80)
        XCTAssertEqual(unavailable, 0)

        // The saved file is the whole document, not a re-assembly of part of it.
        let saved = try XCTUnwrap(try JSONSerialization.jsonObject(with: json) as? [String: Any])
        XCTAssertEqual(saved["userId"] as? String, "u1")
        XCTAssertEqual((saved["data"] as? [String: Any])?.count, 2)
    }

    /// A 2xx that is not an export (an HTML error page, a proxy's JSON) must not
    /// be saved as the user's data.
    func testSuccessWithoutAnExportBodyFails() {
        XCTAssertEqual(DataExportService.classify(status: 200, body: Data("<html>".utf8)), .failed(status: 200))
        XCTAssertEqual(
            DataExportService.classify(status: 200, body: Data(#"{"ok":true}"#.utf8)),
            .failed(status: 200)
        )
        XCTAssertEqual(
            DataExportService.classify(status: 200, body: Data(#"{"exportedAt":"x","data":[]}"#.utf8)),
            .failed(status: 200)
        )
    }

    func testUnreadableTablesAreCounted() {
        let partial = export.replacingOccurrences(
            of: #""unavailable":[]"#,
            with: #""unavailable":[{"table":"a","code":"42P01"},{"table":"b","code":"42501"}]"#
        )
        guard case let .ready(_, _, _, unavailable) =
                DataExportService.classify(status: 200, body: Data(partial.utf8)) else {
            return XCTFail("expected a ready export")
        }
        XCTAssertEqual(unavailable, 2)
    }

    func testSavedMessageSaysWhenTheCopyIsIncomplete() {
        let complete = DataExportService.savedMessage(
            fileName: "f.json", tablesWithData: 2, tablesConsidered: 80, unavailableCount: 0
        )
        XCTAssertTrue(complete.contains("2 of the 80"))
        XCTAssertFalse(complete.contains("incomplete"))

        let partial = DataExportService.savedMessage(
            fileName: "f.json", tablesWithData: 2, tablesConsidered: 80, unavailableCount: 3
        )
        XCTAssertTrue(partial.contains("incomplete"))
        XCTAssertTrue(partial.contains(DataExportService.privacyEmail))
    }

    func testFileNameIsDatedInTheGivenZone() {
        // 2026-11-08 03:00 UTC is still 2026-11-07 in Des Moines.
        let instant = Date(timeIntervalSince1970: 1_794_106_800)
        XCTAssertEqual(
            DataExportService.fileName(now: instant, timeZone: TimeZone(identifier: "America/Chicago")!),
            "desmoines-insider-data-2026-11-07.json"
        )
        XCTAssertEqual(
            DataExportService.fileName(now: instant, timeZone: TimeZone(identifier: "UTC")!),
            "desmoines-insider-data-2026-11-08.json"
        )
    }

    /// The file exporter offers JSON locations and names the file .json.
    func testDocumentIsJSON() {
        XCTAssertEqual(DataExportDocument.readableContentTypes, [.json])
    }
}
