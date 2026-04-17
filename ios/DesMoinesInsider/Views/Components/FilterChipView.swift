import SwiftUI

/// A removable filter chip used in the "active filters" rail across
/// HomeView / RestaurantsView / AttractionsView. Tapping anywhere on the
/// chip calls `onRemove` and fires a light haptic.
///
/// Previously this was redefined as a private helper function in each
/// screen (HomeView.swift:308, RestaurantsView.swift:189,
/// AttractionsView.swift:248) with near-identical styling. Consolidated so
/// future tweaks (padding, border, haptic weight) stay in one place.
struct FilterChipView: View {
    let text: String
    let icon: String
    var tint: Color = .accentColor
    let onRemove: () -> Void

    var body: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            onRemove()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 10))
                Text(text)
                    .font(.caption.weight(.medium))
                    .lineLimit(1)
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .bold))
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .foregroundStyle(tint)
            .background(tint.opacity(0.12), in: Capsule())
            .overlay(Capsule().strokeBorder(tint.opacity(0.3), lineWidth: 0.5))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Remove filter: \(text)")
    }
}

#Preview {
    VStack(alignment: .leading, spacing: 12) {
        HStack {
            FilterChipView(text: "Vegan", icon: "leaf.fill", tint: .green) {}
            FilterChipView(text: "4.5★+", icon: "star.fill", tint: .yellow) {}
            FilterChipView(text: "Featured", icon: "sparkles", tint: .orange) {}
        }
    }
    .padding()
}
