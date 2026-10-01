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

            // Scrolls at the largest Dynamic Type sizes instead of clipping the
            // button off screen (IOS-DD-PLATFORM-09).
            GeometryReader { geo in
                ScrollView {
                    content
                        .padding(.vertical, 24)
                        .frame(maxWidth: .infinity, minHeight: geo.size.height)
                }
                .scrollBounceBehavior(.basedOnSize)
            }
        }
        // Black background regardless of theme, so .secondary must resolve
        // for dark or the message is unreadable in light mode.
        .environment(\.colorScheme, .dark)
        // Announce the blocking state so VoiceOver users aren't stranded silently.
        .accessibilityElement(children: .contain)
    }

    private var content: some View {
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

            actions

            supportLine
        }
    }

    private var actions: some View {
        VStack(spacing: 12) {
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
                .accessibilityLabel("Update Des Moines Insider in the App Store")
            }

            // The floor may have been lowered, or the update just installed.
            Button("Check again") {
                Task { await VersionCheckService.shared.checkOnLaunch() }
            }
            .buttonStyle(.bordered)
        }
        .padding(.horizontal, 48)
    }

    @ViewBuilder
    private var supportLine: some View {
        if let mail = URL(string: "mailto:\(Config.supportEmail)") {
            Link("Contact support", destination: mail)
                .font(.caption)
        } else {
            Text("Need help? Contact \(Config.supportEmail).")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
    }
}

#Preview {
    ForceUpdateView(
        message: "This version of Des Moines Insider is no longer supported. Please update to keep using the app.",
        storeURL: URL(string: "https://apps.apple.com")
    )
}
