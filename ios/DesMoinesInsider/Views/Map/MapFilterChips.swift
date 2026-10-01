import SwiftUI

/// The chip row under the map's search bar (IOS-DD-MAP-13): the three kinds,
/// then the two "around me right now" quick filters.
///
/// It replaces a column of toggles parked behind a fixed 60pt spacer, which
/// collided with the search bar at large text sizes and covered MapKit's own
/// controls.
struct MapFilterChips: View {
    @Bindable var viewModel: MapViewModel

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                kindChip("Events", icon: "calendar", count: viewModel.eventAnnotations.count,
                         tint: MapPalette.event, isOn: $viewModel.showEvents)
                kindChip("Dining", icon: "fork.knife", count: viewModel.restaurantAnnotations.count,
                         tint: MapPalette.restaurant, isOn: $viewModel.showRestaurants)
                kindChip("Places", icon: "mappin.and.ellipse", count: viewModel.attractionAnnotations.count,
                         tint: MapPalette.attraction, isOn: $viewModel.showAttractions)
                Divider().frame(height: 24)
                quickChip("Open now", icon: "clock", isOn: $viewModel.openNowOnly)
                    .accessibilityHint("Events on now and restaurants open now")
                if viewModel.showsWalkable {
                    walkableChip
                }
            }
            .padding(.horizontal)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Map filters")
    }

    private var walkableChip: some View {
        let hint: String = viewModel.canUseWalkable ? "Within about 15 minutes on foot" : "Turn on location to use"
        return quickChip("Walkable", icon: "figure.walk", isOn: $viewModel.walkableOnly)
            .disabled(!viewModel.canUseWalkable)
            .accessibilityHint(Text(hint))
    }

    private func kindChip(_ title: String, icon: String, count: Int, tint: Color, isOn: Binding<Bool>) -> some View {
        Toggle(isOn: isOn) {
            Label(isOn.wrappedValue ? "\(title) · \(count)" : title, systemImage: icon)
                .lineLimit(1)
        }
        .toggleStyle(.button)
        .tint(isOn.wrappedValue ? tint : .gray)
        .font(.caption.weight(.semibold))
        .minHitTarget()
        .glassChip(cornerRadius: 999, material: .ultraThinMaterial)
    }

    private func quickChip(_ title: String, icon: String, isOn: Binding<Bool>) -> some View {
        Toggle(isOn: isOn) {
            Label(title, systemImage: icon)
                .lineLimit(1)
        }
        .toggleStyle(.button)
        .tint(isOn.wrappedValue ? Color.accentColor : .gray)
        .font(.caption.weight(.semibold))
        .minHitTarget()
        .glassChip(cornerRadius: 999, material: .ultraThinMaterial)
    }
}
