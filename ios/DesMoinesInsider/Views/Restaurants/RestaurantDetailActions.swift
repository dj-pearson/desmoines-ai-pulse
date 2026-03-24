import SwiftUI

/// Call, Website, and Directions action buttons row.
struct RestaurantDetailActions: View {
    let restaurant: Restaurant
    let onDirections: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            if let callURL = restaurant.callURL {
                Link(destination: callURL) {
                    Label("Call", systemImage: "phone.fill")
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.green, in: RoundedRectangle(cornerRadius: 12))
                        .foregroundStyle(.white)
                }
                .accessibilityLabel("Call \(restaurant.name)")
            }

            if let websiteURL = restaurant.websiteURL {
                Link(destination: websiteURL) {
                    Label("Website", systemImage: "safari")
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color(.systemGray5), in: RoundedRectangle(cornerRadius: 12))
                        .foregroundStyle(.primary)
                }
                .accessibilityLabel("Visit \(restaurant.name) website")
            }

            if restaurant.coordinate != nil {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    onDirections()
                } label: {
                    Label("Directions", systemImage: "map.fill")
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.blue, in: RoundedRectangle(cornerRadius: 12))
                        .foregroundStyle(.white)
                }
                .accessibilityLabel("Get directions to \(restaurant.name)")
            }
        }
        .padding(.horizontal)
    }
}

#Preview {
    RestaurantDetailActions(restaurant: .preview, onDirections: {})
}
