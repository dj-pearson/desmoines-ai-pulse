import SwiftUI

/// Reusable error state (icon + message + Retry) for list screens that fail to
/// load — offline or server error. Mirrors `EmptyStateView` so Home, Restaurants,
/// and Attractions present the same loading / empty / error / offline structure
/// (IOS-AUDIT-UX-005).
struct ErrorStateView: View {
    var icon: String = "wifi.exclamationmark"
    var title: String = "Something went wrong"
    let message: String
    var retryTitle: String = "Try Again"
    let retry: () -> Void

    @State private var visible = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 18) {
            ZStack {
                Circle()
                    .fill(Color.orange.opacity(0.12))
                    .frame(width: 112, height: 112)
                    .blur(radius: 14)
                Image(systemName: icon)
                    .font(.system(size: 64, weight: .regular))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color.orange, Color.orange.opacity(0.6)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .symbolRenderingMode(.hierarchical)
            }
            .accessibilityHidden(true)
            .scaleEffect((visible || reduceMotion) ? 1 : 0.85)

            Text(title)
                .font(.title3.bold())

            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Button(retryTitle) {
                HapticFeedback.shared.light()
                retry()
            }
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 26)
            .padding(.vertical, 12)
            .foregroundStyle(Color.accentColor)
            .glassChip()
            .buttonStyle(.pressableCard)
            .minHitTarget()
            .padding(.top, 8)
        }
        .padding(.vertical, 32)
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity)
        .glassCard(cornerRadius: PremiumTokens.cornerXl, material: .ultraThinMaterial, elevation: PremiumTokens.elevation8)
        .padding(.horizontal, 24)
        .opacity(visible ? 1 : 0)
        // Reduce Motion (IOS-COMPLY-003): drop the rise/scale entrance; fade only.
        .offset(y: (visible || reduceMotion) ? 0 : 16)
        .animation(reduceMotion ? .linear(duration: 0.15) : PremiumTokens.springSmooth, value: visible)
        .onAppear { visible = true }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(title). \(message)")
    }
}

#Preview {
    ErrorStateView(
        message: "We couldn't load this right now. Check your connection and try again.",
        retry: {}
    )
}
