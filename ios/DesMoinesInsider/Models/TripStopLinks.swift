import Foundation
import CoreLocation

/// A numbered stop for the itinerary map (IOS-DD-TRIP-PLANNER-11).
struct TripMapStop: Hashable, Identifiable {
    /// 1-based position across the whole trip, shown in the pin.
    let number: Int
    let title: String
    let location: String?
    /// The listing's stored coordinate, when it has a plausible one.
    let coordinate: CLLocationCoordinate2D?

    var id: Int { number }

    static func == (lhs: TripMapStop, rhs: TripMapStop) -> Bool {
        lhs.number == rhs.number && lhs.title == rhs.title && lhs.location == rhs.location
            && lhs.coordinate?.latitude == rhs.coordinate?.latitude
            && lhs.coordinate?.longitude == rhs.coordinate?.longitude
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(number)
        hasher.combine(title)
        hasher.combine(location)
        hasher.combine(coordinate?.latitude)
        hasher.combine(coordinate?.longitude)
    }
}

/// Where an itinerary stop leads: its listing, the map, directions
/// (IOS-DD-TRIP-PLANNER-11/12). Pure, so the routing is testable.
enum TripStopLinks {

    /// The stop's stored coordinate from content_details, when it is inside
    /// the service area. Linked listings carry one since 20261014000001, so
    /// the map no longer has to geocode them.
    static func coordinate(for item: TripPlanItem) -> CLLocationCoordinate2D? {
        guard let lat = item.contentDetails?.latitude,
              let lng = item.contentDetails?.longitude else { return nil }
        let c = CLLocationCoordinate2D(latitude: lat, longitude: lng)
        return GeoBoundingBox.isPlausibleMapCoordinate(c) ? c : nil
    }

    /// Every stop in trip order (items are expected day by day, in display
    /// order), numbered across days. Stops with neither a coordinate nor a
    /// location are numbered but cannot be placed.
    static func mapStops(from items: [TripPlanItem]) -> [TripMapStop] {
        items.enumerated().map { index, item in
            let location = item.location?.trimmingCharacters(in: .whitespacesAndNewlines)
            return TripMapStop(
                number: index + 1,
                title: item.title ?? "Stop",
                location: (location?.isEmpty ?? true) ? nil : location,
                coordinate: coordinate(for: item)
            )
        }
    }

    /// The listing a stop links to, or nil for custom stops.
    static func destination(for item: TripPlanItem) -> DeepLinkHandler.Destination? {
        guard let details = item.contentDetails,
              let id = details.id, !id.isEmpty else { return nil }
        switch details.type {
        case "event": return .event(id: id)
        case "restaurant": return .restaurant(id: id)
        case "attraction": return .attraction(id: id)
        default: return nil
        }
    }

    /// Apple Maps directions to a stop: the stored coordinate when there is
    /// one, else its address. Same builder and base as the Map group.
    static func directionsURL(for item: TripPlanItem, base: String) -> URL? {
        Restaurant.directionsURL(
            name: item.title ?? "Stop",
            coordinate: coordinate(for: item),
            address: item.location ?? "",
            base: base
        )
    }
}
