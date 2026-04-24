import SwiftUI

/// Gold-accented VIP badge with crown icon and subtle shimmer.
/// Used on VIP-exclusive content to create a recognizable paid-tier look.
///
/// Mirrors Android `VipGoldBadge` in PremiumBadge.kt. Respects the user's
/// reduce motion accessibility setting.
struct VipGoldBadge: View {
    var label: String = "VIP"

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shimmer: CGFloat = 0

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "crown.fill")
                .font(.system(size: 10, weight: .bold))
            Text(label)
                .font(.system(size: 10, weight: .bold))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(PremiumTokens.premiumGoldGradient, in: Capsule())
        .offset(x: reduceMotion ? 0 : (shimmer - 0.5) * 4)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 2.4).repeatForever(autoreverses: true)) {
                shimmer = 1
            }
        }
        .accessibilityLabel("VIP exclusive")
    }
}

// MARK: - VIP border modifier

extension View {
    /// Applies the premium gold gradient border for VIP-only cards.
    /// Mirrors Android `Modifier.vipGoldBorder`.
    func vipGoldBorder(cornerRadius: CGFloat = PremiumTokens.cornerLg, width: CGFloat = 2) -> some View {
        overlay(
            RoundedRectangle(cornerRadius: cornerRadius)
                .strokeBorder(PremiumTokens.premiumGoldGradient, lineWidth: width)
        )
    }
}

// MARK: - Premium unlock animation

/// A view modifier that plays a brief scale + sparkle animation once when
/// `trigger` flips to true. Use at PremiumGate success sites.
struct PremiumUnlockAnimation: ViewModifier {
    let trigger: Bool
    @State private var scale: CGFloat = 1
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .scaleEffect(scale)
            .onChange(of: trigger) { _, newValue in
                guard newValue, !reduceMotion else { return }
                HapticFeedback.shared.premiumUnlock()
                withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) {
                    scale = 1.08
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                        scale = 1
                    }
                }
            }
    }
}

extension View {
    func premiumUnlockAnimation(trigger: Bool) -> some View {
        modifier(PremiumUnlockAnimation(trigger: trigger))
    }
}

#Preview {
    VStack(spacing: 16) {
        VipGoldBadge()
        Text("VIP exclusive card")
            .padding()
            .background(Color(.systemBackground))
            .vipGoldBorder()
    }
    .padding()
}
