import SwiftUI

// MARK: - Shimmer Effect

extension View {
    /// Adds a shimmer/loading effect over the view.
    func shimmer() -> some View {
        modifier(ShimmerModifier())
    }
}

// MARK: - Accessibility: Selected Toggle Trait

extension View {
    /// Marks a toggle-style button as selected or unselected for VoiceOver and Voice Control.
    /// VoiceOver will announce "selected" / "not selected" automatically.
    func accessibilitySelected(_ isSelected: Bool) -> some View {
        self
            .accessibilityAddTraits(isSelected ? [.isSelected] : [])
            .accessibilityRemoveTraits(isSelected ? [] : [.isSelected])
    }
}

// MARK: - Accessibility: Contrast-Aware Card Shadow

extension View {
    /// Applies a card shadow that strengthens when the user has enabled Increase Contrast,
    /// ensuring the card boundary remains visible without relying on colour alone.
    func accessibleCardShadow() -> some View {
        modifier(ContrastAwareCardShadow())
    }
}

private struct ContrastAwareCardShadow: ViewModifier {
    @State private var isHighContrast = UIAccessibility.isDarkerSystemColorsEnabled

    func body(content: Content) -> some View {
        content
            .shadow(
                color: isHighContrast ? Color.black.opacity(0.28) : Color.black.opacity(0.08),
                radius: isHighContrast ? 4 : 8,
                x: 0,
                y: isHighContrast ? 1 : 2
            )
            .onReceive(
                NotificationCenter.default.publisher(
                    for: UIAccessibility.darkerSystemColorsStatusDidChangeNotification
                )
            ) { _ in
                isHighContrast = UIAccessibility.isDarkerSystemColorsEnabled
            }
    }
}

private struct ShimmerModifier: ViewModifier {
    @State private var phase: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .overlay {
                if !reduceMotion {
                    GeometryReader { geometry in
                        LinearGradient(
                            colors: [
                                .clear,
                                .white.opacity(0.3),
                                .clear,
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .frame(width: geometry.size.width * 2)
                        .offset(x: -geometry.size.width + (phase * geometry.size.width * 3))
                        .clipped()
                    }
                }
            }
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(
                    .linear(duration: 1.5)
                    .repeatForever(autoreverses: false)
                ) {
                    phase = 1
                }
            }
    }
}

// MARK: - Conditional Modifier

extension View {
    @ViewBuilder
    func `if`<Transform: View>(_ condition: Bool, transform: (Self) -> Transform) -> some View {
        if condition {
            transform(self)
        } else {
            self
        }
    }
}

// MARK: - Card Style

extension View {
    func cardStyle() -> some View {
        self
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .shadow(color: .black.opacity(0.06), radius: 6, x: 0, y: 2)
    }
}

// MARK: - Haptic Feedback

extension View {
    func hapticOnTap(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .light) -> some View {
        self.simultaneousGesture(TapGesture().onEnded {
            UIImpactFeedbackGenerator(style: style).impactOccurred()
        })
    }
}
