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
    static func parse(_ string: String?) -> Date? {
        guard let string, !string.isEmpty else { return nil }

        // 1. ISO 8601 with fractional seconds (e.g. "2025-06-15T19:00:00.000Z")
        if let date = isoFractional.date(from: string) { return date }

        // 2. ISO 8601 without fractional seconds (e.g. "2025-06-15T19:00:00Z" or "2025-06-15T19:00:00+00:00")
        if let date = isoBasic.date(from: string) { return date }

        // 3. Fallback formats via DateFormatter
        for formatter in fallbackFormatters {
            if let date = formatter.date(from: string) { return date }
        }

        AppLogger.general.warning("Unrecognized date format: \(string.prefix(40))")
        return nil
    }

    /// Format a Date to ISO 8601 string for API queries.
    static func toISO(_ date: Date) -> String {
        isoBasic.string(from: date)
    }

    // MARK: - Private

    private static let isoFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoBasic: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private static let fallbackFormatters: [DateFormatter] = {
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
