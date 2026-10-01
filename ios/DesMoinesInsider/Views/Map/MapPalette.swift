import SwiftUI

/// One colour per kind of place, used by the pins, clusters, filter chips and
/// cluster sheet (IOS-DD-MAP-13). The Events toggle was blue while the event
/// clusters and sheet rows were red.
enum MapPalette {
    static let event = Color.red
    static let restaurant = Color.orange
    static let attraction = Color.green
}
