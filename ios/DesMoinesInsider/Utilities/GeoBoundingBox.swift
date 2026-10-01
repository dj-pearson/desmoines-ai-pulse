import Foundation
import CoreLocation

/// A lat/lng square around a point, for narrowing a query BEFORE its row limit
/// (IOS-AUDIT-PERF-027).
///
/// The bug this exists to fix: several "nearby" queries took the first N rows
/// and then filtered by distance in Swift. Anything in radius past the cutoff
/// was invisible, so the list came back short or empty while plenty of near rows
/// existed -- and which N rows survived depended on whatever order the table
/// happened to return.
///
/// A box is not a circle, so the caller still applies the exact distance to what
/// comes back. What the box does is make the row limit fall on rows that are
/// already roughly in range, and it does it with plain range predicates that an
/// index on (latitude, longitude) can use -- unlike a distance computed per row.
struct GeoBoundingBox {
    let minLat: Double
    let maxLat: Double
    let minLng: Double
    let maxLng: Double

    /// Miles per degree of latitude. Constant everywhere.
    private static let milesPerLatDegree = 69.0

    init(minLat: Double, maxLat: Double, minLng: Double, maxLng: Double) {
        self.minLat = minLat
        self.maxLat = maxLat
        self.minLng = minLng
        self.maxLng = maxLng
    }

    init(centerLat: Double, centerLng: Double, radiusMiles: Double) {
        let latDelta = radiusMiles / Self.milesPerLatDegree

        // Degrees of longitude shrink toward the poles, hence the cosine. Clamped
        // so a latitude near a pole cannot divide by ~0 and produce a box
        // spanning the planet.
        let cosLat = max(cos(centerLat * .pi / 180), 0.01)
        let lngDelta = radiusMiles / (Self.milesPerLatDegree * cosLat)

        minLat = centerLat - latDelta
        maxLat = centerLat + latDelta
        minLng = centerLng - lngDelta
        maxLng = centerLng + lngDelta
    }

    /// Whether a point falls inside the box. Cheap pre-filter only -- a true
    /// radius test is a distance comparison, which the callers still do.
    func contains(latitude: Double, longitude: Double) -> Bool {
        latitude >= minLat && latitude <= maxLat && longitude >= minLng && longitude <= maxLng
    }

    // MARK: - Map plausibility (IOS-DD-MAP-11)

    /// Iowa plus a small margin. Every listing is in or near Des Moines, so a
    /// row outside this box is a bad geocode: (0,0) "Null Island", a
    /// same-named town in another state, swapped lat/lng.
    static let iowaServiceArea = GeoBoundingBox(minLat: 40.37, maxLat: 43.51, minLng: -96.64, maxLng: -90.14)

    /// Whether a coordinate belongs on the map. The models keep 0.0 as a
    /// valid value (IOS-AUDIT-BUG-016); the map applies its own bound so one
    /// bad row cannot pin the Atlantic or fit a search camera to it.
    static func isPlausibleMapCoordinate(_ c: CLLocationCoordinate2D) -> Bool {
        iowaServiceArea.contains(latitude: c.latitude, longitude: c.longitude)
    }
}
