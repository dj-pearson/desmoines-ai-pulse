import SwiftUI

/// Blocking force-upgrade screen (IOS-AUDIT-REL-001). Shown when
/// `VersionCheckService.forceUpgrade` is true — the running binary is below the
/// server-defined minimum-supported version. There is intentionally no dismiss
/// path: the user must update to continue, which is what lets the backend safely
/// retire shapes an old binary depends on.
struct ForceUpdateView: View {
    let message: String
    let storeURL: URL?

    @Environment(\.openURL) private var openURL

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 24) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(Color.accentColor)
                    .accessibilityHidden(true)

                Text("Update Required")
                    .font(.title.bold())
                    .foregroundStyle(.white)

                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                if let storeURL {
                    Button {
                        openURL(storeURL)
                    } label: {
                        Text("Update Now")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.accentColor)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .padding(.horizontal, 48)
                    .accessibilityLabel("Update Des Moines Insider in the App Store")
                }

                Text("Need help? Contact \(Config.supportEmail).")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
        }
        // Announce the blocking state so VoiceOver users aren't stranded silently.
        .accessibilityElement(children: .contain)
    }
}

#Preview {
    ForceUpdateView(
        message: "This version of Des Moines Insider is no longer supported. Please update to keep using the app.",
        storeURL: URL(string: "https://apps.apple.com")
    )
}
