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
            Image(systemName: message.icon)
                .font(.body.weight(.semibold))
                .foregroundStyle(iconColor)

            Text(message.text)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.primary)
                .lineLimit(2)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .background(.ultraThickMaterial, in: Capsule())
        .shadow(color: .black.opacity(0.12), radius: 12, x: 0, y: 4)
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

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottom) {
                if let message {
                    ToastView(message: message)
                        .padding(.bottom, 24)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                        .zIndex(100)
                }
            }
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: message)
            .onChange(of: message) { _, newValue in
                guard newValue != nil else { return }
                Task { @MainActor in
                    try? await Task.sleep(for: .seconds(2.0))
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
