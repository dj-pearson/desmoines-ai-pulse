import SwiftUI

/// Shows an orange banner when the device has no internet connection.
struct OfflineBanner: View {
    @State private var network = NetworkMonitor.shared

    var body: some View {
        if !network.isConnected {
            HStack(spacing: 8) {
                Image(systemName: "wifi.slash")
                    .font(.caption.weight(.semibold))
                    .accessibilityHidden(true)
                Text("No internet connection")
                    .font(.caption.weight(.medium))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(Color.orange)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("No internet connection. Some features may be unavailable.")
        }
    }
}

#Preview {
    OfflineBanner()
}
