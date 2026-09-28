import SwiftUI

/// Shows an amber banner when offline and a green "Back online" banner on
/// reconnection. The host (MainTabView) animates the insert and removal; an
/// animation on the inserted view itself never ran (IOS-DD-PLATFORM-14).
struct OfflineBanner: View {
    @State private var network = NetworkMonitor.shared

    /// Amber with black text and dark green with white text, both above
    /// 4.5:1. White on .orange / .green was about 2.2:1.
    static let offlineBackground = Color(red: 1.0, green: 0.8, blue: 0.0)
    static let onlineBackground = Color(red: 0.11, green: 0.49, blue: 0.2)

    var body: some View {
        if !network.isConnected {
            bannerContent(
                icon: "wifi.slash",
                text: "No internet connection",
                color: Self.offlineBackground,
                foreground: .black,
                accessibilityText: "No internet connection. Some features may be unavailable."
            )
            .transition(.move(edge: .top).combined(with: .opacity))
        } else if network.showReconnected {
            bannerContent(
                icon: "wifi",
                text: "Back online",
                color: Self.onlineBackground,
                foreground: .white,
                accessibilityText: "Internet connection restored."
            )
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }

    private func bannerContent(
        icon: String,
        text: String,
        color: Color,
        foreground: Color,
        accessibilityText: String
    ) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.caption.weight(.semibold))
                .accessibilityHidden(true)
            Text(text)
                .font(.caption.weight(.medium))
        }
        .foregroundStyle(foreground)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(color)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
    }
}

#Preview {
    OfflineBanner()
}
