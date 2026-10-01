import Foundation

/// Event date text for the App Clip, in Des Moines time (IOS-DD-PLATFORM-04).
///
/// Lives in the app target so DesMoinesInsiderTests can cover it, and is also
/// compiled into the Clip (ios/project.yml), which has no test target of its
/// own. Foundation plus DesMoinesTime only.
enum ClipDateFormat {
    /// ISO 8601 with or without fractional seconds, or nil.
    static func parse(_ raw: String?) -> Date? {
        guard let raw, !raw.isEmpty else { return nil }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        if let date = plain.date(from: raw) { return date }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: raw)
    }

    /// "Mon, Sep 28, 2:00 PM" in Central time (plus " CT" on a phone in
    /// another zone), or "Mon, Sep 28 - Time TBA" for a row with no real start
    /// time: the ingest no-time marker, SeatGeek's placeholder, or time_tbd.
    /// "Date TBA" when the value does not parse; never the raw string.
    static func displayDate(_ raw: String, timeTbd: Bool?) -> String {
        guard let parsed = parse(raw) else { return "Date TBA" }
        let wallTime = DesMoinesTime.localTimeString(parsed)
        let untimed = timeTbd == true
            || wallTime == DesMoinesTime.noTimeMarker
            || wallTime == DesMoinesTime.seatGeekPlaceholder
        if untimed {
            let day = parsed.formatted(DesMoinesTime.style(.dateTime.weekday(.abbreviated).month(.abbreviated).day()))
            return day + " - Time TBA"
        }
        let style = DesMoinesTime.style(.dateTime.weekday(.abbreviated).month(.abbreviated).day().hour().minute())
        return parsed.formatted(style) + DesMoinesTime.zoneSuffix(at: parsed)
    }
}
