import Foundation
import MapKit
import SwiftUI

// MARK: - Cluster

/// A group of pins drawn as one bubble. Stores the centroid of its members and
/// how many of each kind it holds, for the tint and the VoiceOver label.
struct MapCluster: Identifiable {
    enum Kind: Hashable, CaseIterable {
        case event
        case restaurant
        case attraction
    }

    let id: String
    let coordinate: CLLocationCoordinate2D
    var memberIds: [String]
    var kinds: Set<Kind>
    /// Members per kind.
    var kindCounts: [Kind: Int]
    /// Every member sits on the same coordinate (rounded to 5 decimals, about
    /// a metre), so zooming can never separate them.
    var isSingleSpot: Bool

    init(
        id: String,
        coordinate: CLLocationCoordinate2D,
        memberIds: [String],
        kinds: Set<Kind>,
        kindCounts: [Kind: Int] = [:],
        isSingleSpot: Bool = false
    ) {
        self.id = id
        self.coordinate = coordinate
        self.memberIds = memberIds
        self.kinds = kinds
        self.kindCounts = kindCounts
        self.isSingleSpot = isSingleSpot
    }

    var count: Int { memberIds.count }

    /// Primary tint for rendering: prefer events > restaurants > attractions.
    var tintColor: Color {
        if kinds.contains(.event) { return MapPalette.event }
        if kinds.contains(.restaurant) { return MapPalette.restaurant }
        return MapPalette.attraction
    }

    /// "12 places: 3 events, 8 restaurants, 1 place. Double-tap to list them."
    /// (IOS-DD-MAP-12). The generic "12 places here" said nothing about what.
    var accessibilityLabel: String {
        let e = kindCounts[.event] ?? 0
        let r = kindCounts[.restaurant] ?? 0
        let a = kindCounts[.attraction] ?? 0
        func counted(_ n: Int, _ one: String, _ many: String) -> String { "\(n) \(n == 1 ? one : many)" }
        return "\(counted(count, "place", "places")): \(counted(e, "event", "events")), "
            + "\(counted(r, "restaurant", "restaurants")), \(counted(a, "place", "places")). Double-tap to list them."
    }
}

// MARK: - Render items

/// What the map draws: one pin, or one bubble for several.
enum MapRenderItem: Identifiable {
    case single(id: String, kind: MapCluster.Kind, coordinate: CLLocationCoordinate2D)
    case cluster(MapCluster)

    var id: String {
        switch self {
        case .single(let id, let kind, _): return "\(kind)-\(id)"
        case .cluster(let cluster): return "cluster-\(cluster.id)"
        }
    }
}

// MARK: - Clustering

/// Decides which pins are drawn alone and which are grouped (IOS-DD-MAP-08).
///
/// The old rule clustered whenever everything LOADED passed 60 (so the map was
/// always clustered), floored its grid at 0.005 degrees (so a dense block such
/// as Court Ave, or 26 shows at one arena, zoomed forever and never offered
/// the list), drew count-1 bubbles, and stacked identical coordinates so only
/// the top pin could be tapped.
///
/// Now: only what is on screen counts toward the threshold; under it, every
/// pin is drawn alone except those on the same spot, which share a bubble;
/// over it, a grid that keeps shrinking to 0.0005 degrees; a one-member cell
/// is always a plain pin.
enum MapClustering {
    struct Point {
        let id: String
        let coordinate: CLLocationCoordinate2D
        let kind: MapCluster.Kind
    }

    static let defaultThreshold = 60

    /// Whether `c` is inside `region` scaled by `scale` about its centre.
    static func contains(_ region: MKCoordinateRegion, _ c: CLLocationCoordinate2D, scale: Double) -> Bool {
        abs(c.latitude - region.center.latitude) <= region.span.latitudeDelta / 2 * scale
            && abs(c.longitude - region.center.longitude) <= region.span.longitudeDelta / 2 * scale
    }

    /// A coordinate rounded to 5 decimals (about 1 m).
    static func spotKey(_ c: CLLocationCoordinate2D) -> String {
        String(format: "%.5f,%.5f", c.latitude, c.longitude)
    }

    /// The threshold counts pins in the region plus 10%. Items are emitted for
    /// twice the region, so a pan of up to half a screen (when the view
    /// recomputes) never shows an empty edge.
    static func items(_ points: [Point], region: MKCoordinateRegion, threshold: Int = defaultThreshold) -> [MapRenderItem] {
        let visibleCount = points.reduce(0) { contains(region, $1.coordinate, scale: 1.1) ? $0 + 1 : $0 }
        let emitted = points.filter { contains(region, $0.coordinate, scale: 2.0) }
        if visibleCount <= threshold {
            return group(emitted) { spotKey($0.coordinate) }
        }
        let latBucket = max(region.span.latitudeDelta / 8.0, 0.0005)
        let lngBucket = max(region.span.longitudeDelta / 8.0, 0.0005)
        return group(emitted) { point in
            "\(Int((point.coordinate.latitude / latBucket).rounded())):\(Int((point.coordinate.longitude / lngBucket).rounded()))"
        }
    }

    /// Whether tapping a bubble lists its members rather than zooming: small
    /// enough to read, already zoomed in, or all on one spot.
    static func shouldListMembers(_ cluster: MapCluster, latitudeSpan: Double) -> Bool {
        cluster.count <= 25 || latitudeSpan <= 0.01 || cluster.isSingleSpot
    }

    /// Smallest span a cluster tap zooms to.
    static let minimumZoomSpan = 0.002

    private static func group(_ points: [Point], key: (Point) -> String) -> [MapRenderItem] {
        var order: [String] = []
        var groups: [String: [Point]] = [:]
        for point in points {
            let k = key(point)
            if groups[k] == nil { order.append(k) }
            groups[k, default: []].append(point)
        }
        return order.compactMap { k -> MapRenderItem? in
            guard let members = groups[k], let first = members.first else { return nil }
            if members.count == 1 {
                return .single(id: first.id, kind: first.kind, coordinate: first.coordinate)
            }
            return .cluster(cluster(key: k, members: members))
        }
    }

    private static func cluster(key: String, members: [Point]) -> MapCluster {
        var lat = 0.0
        var lng = 0.0
        var counts: [MapCluster.Kind: Int] = [:]
        var spots = Set<String>()
        for m in members {
            lat += m.coordinate.latitude
            lng += m.coordinate.longitude
            counts[m.kind, default: 0] += 1
            spots.insert(spotKey(m.coordinate))
        }
        let n = Double(members.count)
        return MapCluster(
            id: key,
            coordinate: CLLocationCoordinate2D(latitude: lat / n, longitude: lng / n),
            memberIds: members.map(\.id),
            kinds: Set(counts.keys),
            kindCounts: counts,
            isSingleSpot: spots.count == 1
        )
    }
}
