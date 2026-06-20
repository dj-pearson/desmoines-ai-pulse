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

        // 1. ISO 8601 with fractional seconds (e.g. "2025-06-15T19:00:00.000Z")
        // 2. ISO 8601 without fractional seconds ("...T19:00:00Z" / "+00:00")
        // 3. Fallback DateFormatter formats.
        let parsed = isoFractional.date(from: string)
            ?? isoBasic.date(from: string)
            ?? fallbackFormatters.lazy.compactMap { $0.date(from: string) }.first

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
        return formats.map { format in
            let f = DateFormatter()
            f.locale = Locale(identifier: "en_US_POSIX")
            f.dateFormat = format
            return f
        }
    }()
}
