import SwiftUI

/// Animated bottom navigation item matching Android AnimatedTabItem.kt.
///
/// Spring-scales the icon on selection, crossfades between outlined and
/// filled SF Symbol variants, and draws an animated selection indicator.
/// Honors the reduce-motion accessibility setting.
struct AnimatedTabItem: View {
    let label: String
    let systemImage: String
    let isSelected: Bool
    let onTap: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Button(action: {
            HapticFeedback.shared.selection()
            onTap()
        }) {
            VStack(spacing: 4) {
                // Selection indicator pill
                RoundedRectangle(cornerRadius: 2)
                    .fill(isSelected ? Color.accentColor : Color.clear)
                    .frame(width: 22, height: 3)
                    .scaleEffect(x: isSelected ? 1 : 0, y: 1, anchor: .center)
                    .animation(
                        reduceMotion
                            ? .linear(duration: 0)
                            : PremiumTokens.springSmooth,
                        value: isSelected
                    )

                ZStack {
                    // Glass halo behind the icon when selected
                    if isSelected {
                        Circle()
                            .fill(Color.accentColor.opacity(0.14))
                            .frame(width: 38, height: 38)
                            .blur(radius: 6)
                            .transition(.scale.combined(with: .opacity))
                    }

                    Image(systemName: systemImage)
                        .font(.system(size: 22, weight: isSelected ? .semibold : .regular))
                        .symbolVariant(isSelected ? .fill : .none)
                        .foregroundStyle(isSelected ? Color.accentColor : Color.secondary)
                        .scaleEffect(isSelected ? 1.12 : 1.0)
                }
                .animation(
                    reduceMotion
                        ? .linear(duration: 0)
                        : PremiumTokens.springBouncy,
                    value: isSelected
                )

                Text(label)
                    .font(.caption2)
                    .foregroundStyle(isSelected ? Color.accentColor : Color.secondary)
            }
            .frame(minWidth: 56, minHeight: 56)
            .padding(.vertical, 6)
            .padding(.horizontal, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityAddTraits(isSelected ? [.isSelected, .isButton] : [.isButton])
    }
}

#Preview {
    HStack {
        AnimatedTabItem(
            label: "Home",
            systemImage: "house",
            isSelected: true,
            onTap: {}
        )
        AnimatedTabItem(
            label: "Search",
            systemImage: "magnifyingglass",
            isSelected: false,
            onTap: {}
        )
    }
}
