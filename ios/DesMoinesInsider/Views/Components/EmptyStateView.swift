import SwiftUI

/// Reusable empty state view with icon, title, message, and optional primary
/// and secondary actions. Mirrors Android `EmptyStateView.kt`.
struct EmptyStateView: View {
    let icon: String
    let title: String
    let message: String
    var actionTitle: String?
    var action: (() -> Void)?
    var secondaryActionTitle: String?
    var secondaryAction: (() -> Void)?

    @State private var visible = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 18) {
            ZStack {
                Circle()
                    .fill(Color.accentColor.opacity(0.12))
                    .frame(width: 112, height: 112)
                    .blur(radius: 14)
                Image(systemName: icon)
                    .font(.system(size: 64, weight: .regular))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color.accentColor, Color.accentColor.opacity(0.6)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .symbolRenderingMode(.hierarchical)
            }
            .accessibilityHidden(true)
            .scaleEffect((visible || reduceMotion) ? 1 : 0.85)

            Text(title)
                .appText(.title)

            Text(message)
                .appText(.bodySmall)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            if let actionTitle, let action {
                Button(actionTitle) {
                    HapticFeedback.shared.light()
                    action()
                }
                .appText(.bodyEmphasized)
                .padding(.horizontal, 26)
                .padding(.vertical, 12)
                .foregroundStyle(Color.accentColor)
                .glassChip()
                .buttonStyle(.pressableCard)
                .padding(.top, 8)
            }

            if let secondaryActionTitle, let secondaryAction {
                Button(secondaryActionTitle) {
                    secondaryAction()
                }
                .appText(.bodySmall)
                .foregroundStyle(.secondary)
            }
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
    EmptyStateView(
        icon: "calendar.badge.exclamationmark",
        title: "No Events Found",
        message: "Try adjusting your filters or check back later.",
        actionTitle: "Browse all events",
        action: {},
        secondaryActionTitle: "Clear filters",
        secondaryAction: {}
    )
}
