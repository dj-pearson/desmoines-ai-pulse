import SwiftUI

/// Call, Reserve and Directions, then Website and Menu (IOS-DD-RESTAURANTS-10).
///
/// Three flexible labels in one HStack truncated at accessibility sizes, so a
/// row that does not fit stacks vertically. A permanently closed place gets
/// no Call, Reserve or Menu (IOS-DD-RESTAURANTS-06).
struct RestaurantDetailActions: View {
    let restaurant: Restaurant
    let onDirections: () -> Void

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private struct Action: Identifiable {
        let id: String
        let title: String
        let icon: String
        /// nil renders the neutral style.
        let fill: Color?
        let accessibilityLabel: String
        /// nil means Directions, which goes through `onDirections`.
        let url: URL?
    }

    private var isClosedForGood: Bool { restaurant.lifecycle == .closedPermanently }

    private var primary: [Action] {
        var out: [Action] = []
        if !isClosedForGood, let url = restaurant.callURL {
            out.append(Action(id: "call", title: "Call", icon: "phone.fill", fill: .green,
                              accessibilityLabel: "Call \(restaurant.name)", url: url))
        }
        if !isClosedForGood, let url = restaurant.reserveURL {
            out.append(Action(id: "reserve", title: restaurant.reserveLabel, icon: "calendar.badge.plus", fill: .accentColor,
                              accessibilityLabel: "\(restaurant.reserveLabel), \(restaurant.name)", url: url))
        }
        if restaurant.directionsURL != nil {
            out.append(Action(id: "directions", title: "Directions", icon: "map.fill", fill: .blue,
                              accessibilityLabel: "Get directions to \(restaurant.name)", url: nil))
        }
        return Array(out.prefix(3))
    }

    private var secondary: [Action] {
        var out: [Action] = []
        if let url = restaurant.websiteURL {
            out.append(Action(id: "website", title: "Website", icon: "safari", fill: nil,
                              accessibilityLabel: "Visit \(restaurant.name) website", url: url))
        }
        if !isClosedForGood, let url = restaurant.menuURL {
            out.append(Action(id: "menu", title: "Menu", icon: "menucard", fill: nil,
                              accessibilityLabel: "View the \(restaurant.name) menu", url: url))
        }
        return out
    }

    var body: some View {
        let first = primary
        let second = secondary
        if !first.isEmpty || !second.isEmpty {
            VStack(spacing: 10) {
                if !first.isEmpty { row(first) }
                if !second.isEmpty { row(second) }
            }
            .padding(.horizontal)
            .padding(.top, 12)
        }
    }

    @ViewBuilder
    private func row(_ actions: [Action]) -> some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(spacing: 10) { buttons(actions) }
        } else {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 12) { buttons(actions) }
                VStack(spacing: 10) { buttons(actions) }
            }
        }
    }

    private func buttons(_ actions: [Action]) -> some View {
        ForEach(actions) { action in
            if let url = action.url {
                Link(destination: url) { label(action) }
                    .accessibilityLabel(action.accessibilityLabel)
            } else {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    onDirections()
                } label: {
                    label(action)
                }
                .accessibilityLabel(action.accessibilityLabel)
            }
        }
    }

    private func label(_ action: Action) -> some View {
        Label(action.title, systemImage: action.icon)
            .font(.subheadline.weight(.medium))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .padding(.horizontal, 8)
            .background(action.fill ?? Color(.systemGray5), in: RoundedRectangle(cornerRadius: 12))
            .foregroundStyle(action.fill == nil ? Color.primary : Color.white)
    }
}

#Preview {
    RestaurantDetailActions(restaurant: .preview, onDirections: {})
}
