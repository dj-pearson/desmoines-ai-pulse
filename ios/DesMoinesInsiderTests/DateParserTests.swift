import XCTest
@testable import DesMoinesInsider

final class DateParserTests: XCTestCase {

    // MARK: - ISO 8601 with Fractional Seconds

    func testParseISO8601WithFractionalSeconds() {
        let result = DateParser.parse("2025-06-15T19:00:00.000Z")
        XCTAssertNotNil(result)

        let calendar = Calendar(identifier: .gregorian)
        var components = calendar.dateComponents(in: TimeZone(identifier: "UTC")!, from: result!)
        XCTAssertEqual(components.year, 2025)
        XCTAssertEqual(components.month, 6)
        XCTAssertEqual(components.day, 15)
        XCTAssertEqual(components.hour, 19)
        XCTAssertEqual(components.minute, 0)
    }

    // MARK: - ISO 8601 without Fractional Seconds

    func testParseISO8601WithoutFractionalSeconds() {
        let result = DateParser.parse("2025-06-15T19:00:00Z")
        XCTAssertNotNil(result)
    }

    func testParseISO8601WithTimezoneOffset() {
        let result = DateParser.parse("2025-06-15T14:00:00-05:00")
        XCTAssertNotNil(result)

        // 14:00 CDT (-05:00) == 19:00 UTC
        let calendar = Calendar(identifier: .gregorian)
        let components = calendar.dateComponents(in: TimeZone(identifier: "UTC")!, from: result!)
        XCTAssertEqual(components.hour, 19)
    }

    // MARK: - Fallback Formats

    func testParseWithoutTimezone() {
        let result = DateParser.parse("2025-06-15T19:00:00")
        XCTAssertNotNil(result)
    }

    func testParseSpaceSeparated() {
        let result = DateParser.parse("2025-06-15 19:00:00")
        XCTAssertNotNil(result)
    }

    func testParseDateOnly() {
        let result = DateParser.parse("2025-06-15")
        XCTAssertNotNil(result)
    }

    // MARK: - Edge Cases

    func testParseNilReturnsNil() {
        XCTAssertNil(DateParser.parse(nil))
    }

    func testParseEmptyStringReturnsNil() {
        XCTAssertNil(DateParser.parse(""))
    }

    func testParseGarbageReturnsNil() {
        XCTAssertNil(DateParser.parse("not a date"))
        XCTAssertNil(DateParser.parse("2025/06/15"))
        XCTAssertNil(DateParser.parse("June 15, 2025"))
    }

    // MARK: - toISO Round Trip

    func testToISOProducesValidString() {
        let date = Date(timeIntervalSince1970: 1718474400) // 2024-06-15T18:00:00Z
        let isoString = DateParser.toISO(date)
        XCTAssertFalse(isoString.isEmpty)

        // Should be parseable back
        let parsed = DateParser.parse(isoString)
        XCTAssertNotNil(parsed)
        XCTAssertEqual(parsed!.timeIntervalSince1970, date.timeIntervalSince1970, accuracy: 1.0)
    }
}
