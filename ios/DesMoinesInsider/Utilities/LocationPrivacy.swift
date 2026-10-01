import Foundation

/// Coarsens a coordinate before it leaves the device (IOS-DD-MAP-15).
///
/// The map sent the raw fix to the nearby RPCs, which is the user's position
/// to a few metres in every request log. Two decimals is about 1.1 km of
/// latitude, plenty for "what's within 30 miles", and matches the web's
/// roundCoordinate (src/lib/nearMeOrigins.ts). The precise fix stays on the
/// device, where LocationService uses it for distance labels.
enum LocationPrivacy {
    static func coarse(_ value: Double) -> Double {
        (value * 100).rounded() / 100
    }
}
