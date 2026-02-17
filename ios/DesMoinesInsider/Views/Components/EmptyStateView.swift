import SwiftUI

/// Reusable empty state view with icon, title, message, and optional action.
struct EmptyStateView: View {
    let icon: String
    let title: String
    let message: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 48))
                .foregroundStyle(.secondary.opacity(0.6))
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
                    action()
                }
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 24)
                .padding(.vertical, 10)
                .background(Color.accentColor.opacity(0.1), in: Capsule())
                .foregroundStyle(Color.accentColor)
            }
        }
        .padding()
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(title). \(message)")
    }
}

#Preview {
    EmptyStateView(
        icon: "calendar.badge.exclamationmark",
        title: "No Events Found",
        message: "Try adjusting your filters or check back later.",
        actionTitle: "Clear Filters",
        action: {}
    )
}
