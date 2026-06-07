import SwiftUI

/// Shows an orange banner when offline and a green "Back online" banner on reconnection.
struct OfflineBanner: View {
    @State private var network = NetworkMonitor.shared
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        if !network.isConnected {
            bannerContent(
                icon: "wifi.slash",
                text: "No internet connection",
                color: .orange,
                accessibilityText: "No internet connection. Some features may be unavailable."
            )
            .transition(.move(edge: .top).combined(with: .opacity))
        } else if network.showReconnected {
            bannerContent(
                icon: "wifi",
                text: "Back online",
                color: .green,
                accessibilityText: "Internet connection restored."
            )
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }

    private func bannerContent(icon: String, text: String, color: Color, accessibilityText: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.caption.weight(.semibold))
                .accessibilityHidden(true)
            Text(text)
                .font(.caption.weight(.medium))
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(color)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
        // Reduce Motion (IOS-COMPLY-003): swap the spring slide for an instant
        // change so the banner doesn't animate in/out for motion-sensitive users.
        .animation(reduceMotion ? .linear(duration: 0) : .spring(duration: 0.35), value: network.isConnected)
        .animation(reduceMotion ? .linear(duration: 0) : .spring(duration: 0.35), value: network.showReconnected)
    }
}

#Preview {
    OfflineBanner()
}
