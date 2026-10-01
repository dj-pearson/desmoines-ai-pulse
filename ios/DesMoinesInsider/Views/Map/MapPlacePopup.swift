import SwiftUI
import CoreLocation

/// Where a map pin, popup or list row leads.
enum MapDestination: Hashable {
    case event(Event)
    case restaurant(Restaurant)
    case attraction(Attraction)
}

/// What the popup under a tapped pin shows (IOS-DD-MAP-09). Built once from
/// the model so the rules are testable and the three kinds share one layout.
///
/// The old popups: only events had a Details button (restaurants and
/// attractions had no navigation destination at all), nothing had
/// Directions, the event time was the device zone with the 19:31:58
/// placeholder printed as a showtime, and nothing said Sponsored.
struct MapPopupModel {
    struct Action {
        let title: String
        let icon: String
        let url: URL
    }

    let title: String
    let subtitle: String
    let detail: String
    let imageURL: String?
    let placeholderIcon: String
    let tint: Color
    let distanceText: String?
    let isSponsored: Bool
    let directionsURL: URL?
    let secondaryAction: Action?
    let destination: MapDestination

    static let mapsBase = "https://maps.apple.com/"

    static func make(for destination: MapDestination, distanceText: String?, now: Date = Date()) -> MapPopupModel {
        switch destination {
        case .event(let event): return make(event: event, distanceText: distanceText, now: now)
        case .restaurant(let restaurant): return make(restaurant: restaurant, distanceText: distanceText, now: now)
        case .attraction(let attraction): return make(attraction: attraction, distanceText: distanceText)
        }
    }

    /// Date in Central time with "Time TBA" for a placeholder time
    /// (Event.cardDateText), led by "Happening now" while it is on.
    static func make(event: Event, distanceText: String?, now: Date = Date()) -> MapPopupModel {
        var subtitle = event.parsedDate.map { event.cardDateText($0) } ?? "Date to be announced"
        if event.happeningNow(at: now) { subtitle = "Happening now · " + subtitle }
        return MapPopupModel(
            title: event.title,
            subtitle: subtitle,
            detail: event.displayLocation,
            imageURL: event.imageUrl,
            placeholderIcon: event.eventCategory.icon,
            tint: MapPalette.event,
            distanceText: distanceText,
            isSponsored: event.isActivelySponsored,
            directionsURL: Restaurant.directionsURL(
                name: event.venue ?? event.title,
                coordinate: event.coordinate,
                address: event.displayLocation,
                base: mapsBase
            ),
            secondaryAction: nil,
            destination: .event(event)
        )
    }

    /// Lifecycle ("Permanently closed", "Opens Oct 12") ahead of the hours
    /// line, then cuisine. Call is hidden for a place closed for good, as on
    /// the detail screen.
    static func make(restaurant: Restaurant, distanceText: String?, now: Date = Date()) -> MapPopupModel {
        let status = restaurant.lifecycleLabel ?? restaurant.openStatus(at: now).line ?? "Hours unknown"
        let subtitle = [status, restaurant.cuisine]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
        var call: Action?
        if restaurant.lifecycle != .closedPermanently, let url = restaurant.callURL {
            call = Action(title: "Call", icon: "phone.fill", url: url)
        }
        return MapPopupModel(
            title: restaurant.name,
            subtitle: subtitle,
            detail: restaurant.displayLocation,
            imageURL: restaurant.imageUrl,
            placeholderIcon: "fork.knife",
            tint: MapPalette.restaurant,
            distanceText: distanceText,
            isSponsored: restaurant.isActivelySponsored,
            directionsURL: restaurant.directionsURL,
            secondaryAction: call,
            destination: .restaurant(restaurant)
        )
    }

    static func make(attraction: Attraction, distanceText: String?) -> MapPopupModel {
        var website: Action?
        if let url = attraction.websiteURL {
            website = Action(title: "Website", icon: "safari", url: url)
        }
        return MapPopupModel(
            title: attraction.name,
            subtitle: attraction.attractionType.displayName,
            detail: attraction.location ?? "",
            imageURL: attraction.imageUrl,
            placeholderIcon: attraction.attractionType.icon,
            tint: MapPalette.attraction,
            distanceText: distanceText,
            // Attractions carry no sponsorship fields.
            isSponsored: false,
            directionsURL: Restaurant.directionsURL(
                name: attraction.name,
                coordinate: attraction.coordinate,
                address: attraction.location ?? "",
                base: mapsBase
            ),
            secondaryAction: website,
            destination: .attraction(attraction)
        )
    }
}

/// The card under the map for the selected pin.
struct MapPlacePopup: View {
    let model: MapPopupModel
    let onOpen: () -> Void
    let onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            summary
            // Actions share a row until they do not fit (accessibility sizes),
            // then take their own rows.
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { actions }
                VStack(alignment: .leading, spacing: 8) { actions }
            }
        }
        .padding(14)
        .background(.ultraThickMaterial, in: RoundedRectangle(cornerRadius: 16))
        .shadow(radius: 8)
        .padding()
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    private var summary: some View {
        Button(action: onOpen) {
            HStack(alignment: .top, spacing: 12) {
                thumbnail
                text
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens details")
    }

    private var thumbnail: some View {
        CachedAsyncImage(url: model.imageURL) {
            ZStack {
                Rectangle().fill(model.tint.opacity(0.15))
                Image(systemName: model.placeholderIcon)
                    .foregroundStyle(model.tint.opacity(0.6))
            }
        }
        .frame(width: 64, height: 64)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var text: some View {
        VStack(alignment: .leading, spacing: 4) {
            if model.isSponsored {
                Text("Sponsored")
                    .font(.caption2.weight(.semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .overlay(Capsule().strokeBorder(Color.secondary, lineWidth: 1))
            }
            Text(model.title)
                .font(.subheadline.weight(.semibold))
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            Text(model.subtitle)
                .font(.caption)
                .foregroundStyle(.secondary)
            if !model.detail.isEmpty || model.distanceText != nil {
                Text([model.detail, model.distanceText ?? ""].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
    }

    @ViewBuilder
    private var actions: some View {
        if let url = model.directionsURL {
            Link(destination: url) {
                actionLabel("Directions", icon: "arrow.triangle.turn.up.right.circle.fill")
            }
            .minHitTarget()
            .accessibilityLabel("Directions to \(model.title)")
        }
        if let action = model.secondaryAction {
            Link(destination: action.url) {
                actionLabel(action.title, icon: action.icon)
            }
            .minHitTarget()
            .accessibilityLabel("\(action.title) \(model.title)")
        }
        Button(action: onClose) {
            actionLabel("Close", icon: "xmark")
        }
        .minHitTarget()
        .accessibilityLabel("Close")
    }

    private func actionLabel(_ title: String, icon: String) -> some View {
        Label(title, systemImage: icon)
            .font(.footnote.weight(.semibold))
            .lineLimit(1)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color.secondary.opacity(0.15), in: Capsule())
            .foregroundStyle(.primary)
    }
}

extension MapDestination {
    var coordinate: CLLocationCoordinate2D? {
        switch self {
        case .event(let e): return e.coordinate
        case .restaurant(let r): return r.coordinate
        case .attraction(let a): return a.coordinate
        }
    }
}

/// VoiceOver labels for map pins (IOS-DD-MAP-12): name, kind, the state that
/// matters (time or open status), distance, and Sponsored when it is. The
/// pins were a coloured circle and an SF Symbol with no label at all.
enum MapPinLabel {
    static func event(_ event: Event, distance: String?) -> String {
        var parts = [event.title, "event"]
        if let date = event.parsedDate { parts.append(event.cardDateText(date)) }
        if let distance { parts.append(distance) }
        if event.isActivelySponsored { parts.append("Sponsored") }
        return parts.joined(separator: ", ")
    }

    static func restaurant(_ restaurant: Restaurant, distance: String?) -> String {
        var parts = [restaurant.name, "restaurant", restaurant.lifecycleLabel ?? restaurant.openStatusText]
        if let distance { parts.append(distance) }
        if restaurant.isActivelySponsored { parts.append("Sponsored") }
        return parts.joined(separator: ", ")
    }

    static func attraction(_ attraction: Attraction, distance: String?) -> String {
        var parts = [attraction.name, attraction.attractionType.displayName]
        if let distance { parts.append(distance) }
        return parts.joined(separator: ", ")
    }
}
