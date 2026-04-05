import SwiftUI

/// Branded refresh indicator matching Android `BrandedRefreshIndicator.kt`.
///
/// A circular stroke arc on a brand gradient that rotates while refreshing.
/// SwiftUI's `.refreshable` does not expose a progress value, so this view
/// provides two modes: a bound progress (for custom pull-down UI) or an
/// auto-spin when used purely as an in-flight indicator.
struct BrandedRefreshView: View {
    var progress: CGFloat = 0
    var isRefreshing: Bool = false

    @State private var spinAngle: Double = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var rotation: Double {
        isRefreshing ? spinAngle : Double(progress * 360)
    }

    private var sweep: CGFloat {
        isRefreshing ? 0.75 : max(0, min(1, progress)) * 0.75
    }

    var body: some View {
        ZStack {
            Circle()
                .fill(Color(.systemBackground))

            Circle()
                .trim(from: 0, to: sweep)
                .stroke(
                    PremiumTokens.premiumGoldGradient,
                    style: StrokeStyle(lineWidth: 3, lineCap: .round)
                )
                .rotationEffect(.degrees(rotation - 90))
                .frame(width: 24, height: 24)
        }
        .frame(width: 40, height: 40)
        .onAppear {
            guard isRefreshing, !reduceMotion else { return }
            withAnimation(.linear(duration: 0.9).repeatForever(autoreverses: false)) {
                spinAngle = 360
            }
        }
        .accessibilityLabel(isRefreshing ? "Refreshing" : "Pull to refresh")
    }
}

#Preview {
    VStack(spacing: 20) {
        BrandedRefreshView(progress: 0.3)
        BrandedRefreshView(progress: 1.0)
        BrandedRefreshView(isRefreshing: true)
    }
    .padding()
}
