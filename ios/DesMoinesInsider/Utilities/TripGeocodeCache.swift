import Foundation
import CoreLocation

/// Process-wide cache of geocoded itinerary stops (IOS-AUDIT-PERF-024).
///
/// TripMapPreview geocoded up to eight stops sequentially inside a bare `.task`,
/// so every appearance of an itinerary re-issued the same eight CLGeocoder
/// requests. CLGeocoder is rate-limited by Apple per app, and it throttles
/// silently: past the limit the requests simply start failing, so the map goes
/// from slow to empty with nothing logged. Opening the same trip three times was
/// twenty-four requests for eight addresses.
///
/// ONLY SUCCESSES ARE CACHED. A failure is usually the network or the throttle
/// rather than a bad address, and caching that would turn a transient outage
/// into a permanently blank map for the life of the process.
///
/// Not persisted to disk on purpose. Apple's terms restrict storing geocoding
/// results, and a trip is opened a handful of times in a session - the repeat
/// cost this exists to remove is within one launch, not across launches.
@MainActor
enum TripGeocodeCache {
    private static var coordinates: [String: CLLocationCoordinate2D] = [:]

    /// The address actually sent to CLGeocoder.
    ///
    /// A stop stored as "Court Avenue" is ambiguous worldwide, so the city and
    /// state are appended - but only when the string does not already name the
    /// city, or "Des Moines, IA" ends up in the query twice and the geocoder
    /// returns nothing. Pure, and the part worth testing: it is the cache key as
    /// well as the query, so a change here silently invalidates the cache.
    static func normalizedQuery(for location: String) -> String {
        let trimmed = location.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.localizedCaseInsensitiveContains("Des Moines") {
            return trimmed
        }
        return "\(trimmed), Des Moines, IA"
    }

    /// Coordinate for an already-resolved query, or nil.
    static func cached(_ query: String) -> CLLocationCoordinate2D? {
        coordinates[query]
    }

    static func store(_ coordinate: CLLocationCoordinate2D, for query: String) {
        coordinates[query] = coordinate
    }

    /// Number of resolved addresses held. For tests and diagnostics.
    static var count: Int { coordinates.count }

    /// Tests only.
    static func reset() {
        coordinates.removeAll()
    }
}
