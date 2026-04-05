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

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 72, weight: .regular))
                .foregroundStyle(Color.accentColor)
                .accessibilityHidden(true)

            Text(title)
                .font(.title3.bold())

            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            if let actionTitle, let action {
                Button(actionTitle) {
                    HapticFeedback.shared.light()
                    action()
                }
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 24)
                .padding(.vertical, 10)
                .background(Color.accentColor.opacity(0.12), in: Capsule())
                .foregroundStyle(Color.accentColor)
                .padding(.top, 8)
            }

            if let secondaryActionTitle, let secondaryAction {
                Button(secondaryActionTitle) {
                    secondaryAction()
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
            }
        }
        .padding()
        .opacity(visible ? 1 : 0)
        .offset(y: visible ? 0 : 12)
        .animation(.easeOut(duration: PremiumTokens.motionBase), value: visible)
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
