import SwiftUI

/// Lightweight toast/snackbar for transient action feedback.
///
/// Usage:
/// ```
/// @State private var toast: ToastMessage?
///
/// SomeView()
///     .toastOverlay(message: $toast)
/// ```
struct ToastMessage: Equatable {
    let text: String
    let icon: String
    let style: Style

    enum Style {
        case success, info, error
    }

    static func success(_ text: String, icon: String = "checkmark.circle.fill") -> ToastMessage {
        ToastMessage(text: text, icon: icon, style: .success)
    }

    static func info(_ text: String, icon: String = "info.circle.fill") -> ToastMessage {
        ToastMessage(text: text, icon: icon, style: .info)
    }

    static func error(_ text: String, icon: String = "exclamationmark.triangle.fill") -> ToastMessage {
        ToastMessage(text: text, icon: icon, style: .error)
    }
}

// MARK: - Toast View

private struct ToastView: View {
    let message: ToastMessage

    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(iconColor.opacity(0.18))
                    .frame(width: 28, height: 28)
                Image(systemName: message.icon)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(iconColor)
            }

            Text(message.text)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.primary)
                .lineLimit(2)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .glassBar(cornerRadius: 999, material: .ultraThickMaterial, elevation: PremiumTokens.elevation8)
        .overlay(
            Capsule(style: .continuous)
                .strokeBorder(iconColor.opacity(0.25), lineWidth: 0.75)
        )
    }

    private var iconColor: Color {
        switch message.style {
        case .success: return .green
        case .info: return .blue
        case .error: return .red
        }
    }
}

// MARK: - View Modifier

struct ToastOverlayModifier: ViewModifier {
    @Binding var message: ToastMessage?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottom) {
                if let message {
                    ToastView(message: message)
                        .padding(.bottom, 24)
                        // Reduce Motion (IOS-COMPLY-003): fade instead of sliding up.
                        .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
                        .zIndex(100)
                }
            }
            .animation(reduceMotion ? .easeInOut(duration: 0.2) : .spring(response: 0.35, dampingFraction: 0.8), value: message)
            .onChange(of: message) { _, newValue in
                guard let newValue else { return }
                // Toasts are otherwise silent for VoiceOver — announce the text so
                // assistive-tech users get the same feedback (IOS-AUDIT-UX-003).
                UIAccessibility.post(notification: .announcement, argument: newValue.text)
                // Give VoiceOver users longer to hear it before auto-dismiss.
                let duration: Double = UIAccessibility.isVoiceOverRunning ? 4.0 : 2.0
                Task { @MainActor in
                    try? await Task.sleep(for: .seconds(duration))
                    if self.message == newValue {
                        self.message = nil
                    }
                }
            }
    }
}

extension View {
    func toastOverlay(message: Binding<ToastMessage?>) -> some View {
        modifier(ToastOverlayModifier(message: message))
    }
}
