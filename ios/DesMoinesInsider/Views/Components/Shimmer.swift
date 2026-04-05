import SwiftUI

/// Shimmer placeholder modifier for skeleton loading states.
///
/// Mirrors Android `rememberShimmerBrush` in ShimmerEffect.kt. Respects the
/// user's reduce motion accessibility setting by falling back to a static
/// placeholder color.
///
/// Usage:
/// ```swift
/// RoundedRectangle(cornerRadius: 12)
///     .fill(Color(.systemGray5))
///     .frame(height: 160)
///     .shimmer()
/// ```
struct ShimmerModifier: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var phase: CGFloat = -1

    var duration: Double = 1.2

    func body(content: Content) -> some View {
        content
            .overlay(
                GeometryReader { proxy in
                    if !reduceMotion {
                        LinearGradient(
                            gradient: Gradient(colors: [
                                Color.white.opacity(0.0),
                                Color.white.opacity(0.55),
                                Color.white.opacity(0.0)
                            ]),
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .rotationEffect(.degrees(20))
                        .offset(x: phase * proxy.size.width * 1.6)
                        .blendMode(.plusLighter)
                        .allowsHitTesting(false)
                        .onAppear {
                            withAnimation(
                                .linear(duration: duration).repeatForever(autoreverses: false)
                            ) {
                                phase = 1
                            }
                        }
                    }
                }
            )
            .clipped()
    }
}

extension View {
    /// Apply a shimmer sweep to a skeleton placeholder view.
    func shimmer(duration: Double = 1.2) -> some View {
        modifier(ShimmerModifier(duration: duration))
    }
}

// MARK: - Skeleton building blocks

/// Lightweight skeleton shapes used to compose loading placeholders.
/// These match the card layouts of the real content for a calm loading feel.
enum Skeleton {
    static func bar(width: CGFloat? = nil, height: CGFloat = 14, radius: CGFloat = 6) -> some View {
        RoundedRectangle(cornerRadius: radius)
            .fill(Color(.systemGray5))
            .frame(width: width, height: height)
            .shimmer()
    }

    static func block(height: CGFloat, radius: CGFloat = 12) -> some View {
        RoundedRectangle(cornerRadius: radius)
            .fill(Color(.systemGray5))
            .frame(height: height)
            .shimmer()
    }

    /// Event card skeleton that approximates the final card layout.
    static var eventCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            block(height: 140)
            bar(width: 180)
            bar(width: 120, height: 12)
        }
        .padding(12)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

#Preview {
    VStack(spacing: 12) {
        Skeleton.eventCard
        Skeleton.eventCard
    }
    .padding()
}
