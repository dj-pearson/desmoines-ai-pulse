import Foundation

/// Des Moines wall-clock time (IOS-DD-EVENTS-05).
///
/// Every event is in Des Moines, so its time and its day belong to Central
/// time whatever zone the phone is in. Formatting with the device zone printed
/// a 7pm show as 8pm on a phone set to Eastern, and computing "today" from the
/// device zone moved the query floor by the same offset. Mirrors
/// src/lib/timezone.ts (CENTRAL_TIMEZONE, NO_TIME_MARKER).
enum DesMoinesTime {
    // swiftlint:disable:next force_unwrapping
    static let timeZone = TimeZone(identifier: "America/Chicago")!

    /// A Gregorian calendar pinned to Central time. A computed property so a
    /// caller can mutate its copy freely.
    static var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = timeZone
        return c
    }

    /// The wall-clock time ingest writes when a source published no start time.
    /// Mirrors supabase/functions/_shared/eventDateTime.ts NO_TIME_MARKER and
    /// src/lib/timezone.ts.
    static let noTimeMarker = "19:31:58"

    /// SeatGeek's placeholder for an unannounced showtime (WEB-BE-038,
    /// migration 20260902000016).
    static let seatGeekPlaceholder = "03:30:00"

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = timeZone
        f.dateFormat = "HH:mm:ss"
        return f
    }()

    /// "HH:mm:ss" of `date` in Central time.
    static func localTimeString(_ date: Date) -> String {
        timeFormatter.string(from: date)
    }

    /// A copy of `base` that formats in Central time.
    static func style(_ base: Date.FormatStyle) -> Date.FormatStyle {
        var s = base
        s.timeZone = timeZone
        return s
    }

    /// Whether the device is in a different UTC offset from Des Moines right
    /// now, in which case displayed times get a " CT" suffix so nobody reads a
    /// Central time as their own.
    static func deviceDiffersFromCentral(at date: Date = Date()) -> Bool {
        TimeZone.current.secondsFromGMT(for: date) != timeZone.secondsFromGMT(for: date)
    }

    /// " CT" when the device is not on Central time, else "".
    static func zoneSuffix(at date: Date = Date()) -> String {
        deviceDiffersFromCentral(at: date) ? " CT" : ""
    }
}
