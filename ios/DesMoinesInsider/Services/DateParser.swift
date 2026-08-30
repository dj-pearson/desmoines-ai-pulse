import Foundation
import os

/// Single authoritative date parser for the entire app.
///
/// Supports all formats used by the Supabase backend:
/// - ISO 8601 with fractional seconds and timezone
/// - ISO 8601 without fractional seconds
/// - ISO 8601 without timezone (local time)
/// - "yyyy-MM-dd HH:mm:ss" (common DB format)
/// - "yyyy-MM-dd" (date only)
enum DateParser {
    /// Parse a date string in any supported format, returning nil if unrecognized.
    ///
    /// Results are memoized by raw string (IOS-AUDIT-PERF-011) so callers like
    /// `Event.parsedDate` don't re-parse on every SwiftUI body evaluation. NSCache
    /// is thread-safe, so this is safe to call from any actor.
    static func parse(_ string: String?) -> Date? {
        guard let string, !string.isEmpty else { return nil }

        let key = string as NSString
        if let cached = parseCache.object(forKey: key) { return cached as Date }

        // 1. ISO 8601 with fractional seconds (e.g. "2025-06-15T19:00:00.000Z").
        //    `ISO8601DateFormatter.withFractionalSeconds` only accepts EXACTLY 3
        //    fractional digits, but Postgres `timestamptz` serializes at microsecond
        //    precision (1–6 digits, e.g. ".123456+00:00"). Normalize the fraction to
        //    3 digits before handing it to the formatter so those values parse
        //    instead of silently returning nil (IOS-AUDIT-DATA-001).
        // 2. ISO 8601 without fractional seconds ("...T19:00:00Z" / "+00:00").
        // 3. Fallback DateFormatter formats.
        let parsed = isoFractional.date(from: string)
            ?? isoFractional.date(from: Self.normalizedFraction(string))
            ?? isoBasic.date(from: string)
            ?? fallbackFormatters.lazy.compactMap { Self.strictDate(from: string, using: $0) }.first

        if let parsed {
            parseCache.setObject(parsed as NSDate, forKey: key)
            return parsed
        }

        AppLogger.general.warning("Unrecognized date format: \(string.prefix(40))")
        return nil
    }

    /// Memoizes successful parses. NSCache is thread-safe; the formatters below
    /// are only ever read (never reconfigured), so concurrent reads are safe.
    nonisolated(unsafe) private static let parseCache = NSCache<NSString, NSDate>()

    /// Format a Date to ISO 8601 string for API queries.
    static func toISO(_ date: Date) -> String {
        isoBasic.string(from: date)
    }

    // MARK: - Private

    // Read-only after configuration; ISO8601DateFormatter/DateFormatter are
    // thread-safe for parsing, so concurrent cross-actor reads are safe
    // (IOS-AUDIT-PERF-011).
    nonisolated(unsafe) private static let isoFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    nonisolated(unsafe) private static let isoBasic: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    nonisolated(unsafe) private static let fallbackFormatters: [DateFormatter] = {
        let formats = [
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd HH:mm:ss",
            "yyyy-MM-dd",
        ]
        // These formats carry no timezone offset. The backend emits offset-less
        // instants in UTC, so parse them as UTC rather than device-local — a
        // user outside Central time would otherwise see event times shifted by
        // their UTC offset (IOS-AUDIT-DATA-002).
        let utc = TimeZone(identifier: "UTC")
        return formats.map { format in
            let f = DateFormatter()
            f.locale = Locale(identifier: "en_US_POSIX")
            f.timeZone = utc
            f.dateFormat = format
            return f
        }
    }()

    /// Parses with `formatter` only when the result round-trips back to the exact
    /// input string.
    ///
    /// `DateFormatter` does not hold a fixed `dateFormat` strictly: with
    /// `en_US_POSIX` and "yyyy-MM-dd" it still accepts "2025/06/15" and returns
    /// 2025-06-15, so a string in a format this parser does not claim to support
    /// silently became a real Date. That is the dangerous failure mode — not a
    /// nil, but a plausible wrong answer. Re-formatting the parsed date and
    /// requiring an exact match rejects those while leaving every documented
    /// format untouched, since each one formats back to itself.
    private static func strictDate(from string: String, using formatter: DateFormatter) -> Date? {
        guard let date = formatter.date(from: string),
              formatter.string(from: date) == string else { return nil }
        return date
    }

    /// Rewrites the fractional-seconds component of an ISO-8601 string to exactly
    /// 3 digits so `ISO8601DateFormatter.withFractionalSeconds` accepts Postgres
    /// microsecond timestamps. Pads or truncates the run of digits after the
    /// decimal point; returns the input unchanged when there is no fraction.
    static func normalizedFraction(_ string: String) -> String {
        guard let dot = string.firstIndex(of: ".") else { return string }
        let afterDot = string.index(after: dot)
        var end = afterDot
        while end < string.endIndex, string[end].isNumber {
            end = string.index(after: end)
        }
        let digitCount = string.distance(from: afterDot, to: end)
        guard digitCount != 3 else { return string }
        let digits = string[afterDot..<end]
        let normalized: String
        if digitCount > 3 {
            normalized = String(digits.prefix(3))
        } else {
            normalized = digits + String(repeating: "0", count: 3 - digitCount)
        }
        return String(string[..<afterDot]) + normalized + String(string[end...])
    }
}
