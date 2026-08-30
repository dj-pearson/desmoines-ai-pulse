import XCTest
@testable import DesMoinesInsider

/// IOS-AUDIT-FEAT-010 — verifies the first-party CrashReportingService actually
/// captures and persists non-fatal records (and attaches user id / custom keys),
/// and that the read/flush API drains them. Fatal signal / NSException capture
/// can't be exercised in-process from a unit test (it would terminate the
/// runner), so it's validated by code inspection; the persistence + context
/// plumbing it relies on is covered here.
@MainActor
final class CrashReportingTests: XCTestCase {

    private var service: CrashReportingService { CrashReportingService.shared }

    override func setUp() {
        super.setUp()
        service.configure()
        // Start from a clean store so prior runs don't leak in.
        _ = service.flushPendingRecords()
    }

    override func tearDown() {
        _ = service.flushPendingRecords()
        super.tearDown()
    }

    func testRecordErrorPersistsRecord() {
        let error = NSError(domain: "TestDomain", code: 42, userInfo: [NSLocalizedDescriptionKey: "boom"])
        service.recordError(error)

        // The store writes on a background queue; poll briefly for the file.
        let records = waitForRecords(count: 1)
        XCTAssertEqual(records.count, 1)
        XCTAssertEqual(records.first?.kind, .nonFatal)
        XCTAssertTrue(records.first?.message.contains("TestDomain") ?? false)
        XCTAssertTrue(records.first?.message.contains("42") ?? false)
        XCTAssertFalse(records.first?.callStack.isEmpty ?? true)
    }

    func testCustomKeysAndUserIdAreAttached() {
        service.setUserId("user-1234567890")
        service.setCustomValue("discover", forKey: "screen")
        let error = NSError(domain: "TestDomain", code: 1)
        service.recordError(error, context: ["action": "load"])

        let records = waitForRecords(count: 1)
        let record = records.first
        XCTAssertNotNil(record?.userId)
        // User id is hashed (hex) and truncated to 16 chars — never the raw value.
        XCTAssertNotEqual(record?.userId, "user-1234567890")
        XCTAssertEqual(record?.userId?.count, 16)
        XCTAssertEqual(record?.customKeys["screen"], "discover")
        XCTAssertEqual(record?.customKeys["action"], "load")
    }

    func testFlushDrainsRecords() {
        service.recordError(NSError(domain: "A", code: 1))
        service.recordError(NSError(domain: "B", code: 2))
        _ = waitForRecords(count: 2)

        let flushed = service.flushPendingRecords()
        XCTAssertEqual(flushed.count, 2)
        // After flushing, nothing remains.
        XCTAssertTrue(service.pendingRecords().isEmpty)
    }

    func testRecordsAreOrderedOldestFirst() {
        service.recordError(NSError(domain: "first", code: 1))
        _ = waitForRecords(count: 1)
        service.recordError(NSError(domain: "second", code: 2))
        let records = waitForRecords(count: 2)
        XCTAssertEqual(records.count, 2)
        XCTAssertTrue(records[0].timestamp <= records[1].timestamp)
        XCTAssertTrue(records[0].message.contains("first"))
        XCTAssertTrue(records[1].message.contains("second"))
    }

    // MARK: - Helpers

    /// Records are persisted on a background queue, so poll for up to ~2s.
    private func waitForRecords(count: Int) -> [CrashRecord] {
        for _ in 0..<40 {
            let records = service.pendingRecords()
            if records.count >= count { return records }
            RunLoop.current.run(until: Date().addingTimeInterval(0.05))
        }
        return service.pendingRecords()
    }
}
