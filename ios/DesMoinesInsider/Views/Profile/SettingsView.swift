import SwiftUI

/// App settings view.
struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = true

    var body: some View {
        NavigationStack {
            List {
                Section("General") {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text(appVersion)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Notifications") {
                    Button {
                        openNotificationSettings()
                    } label: {
                        Label("Notification Settings", systemImage: "bell")
                    }
                }

                Section("About") {
                    Link(destination: Config.siteURL) {
                        Label("Website", systemImage: "safari")
                    }

                    Link(destination: URL(string: "mailto:\(Config.supportEmail)")!) {
                        Label("Contact Support", systemImage: "envelope")
                    }

                    Link(destination: Config.siteURL.appendingPathComponent("privacy-policy")) {
                        Label("Privacy Policy", systemImage: "hand.raised")
                    }

                    Link(destination: Config.siteURL.appendingPathComponent("terms")) {
                        Label("Terms of Service", systemImage: "doc.text")
                    }
                }

                #if DEBUG
                Section("Debug") {
                    Button("Reset Onboarding") {
                        hasCompletedOnboarding = false
                        dismiss()
                    }
                }
                #endif
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private var appVersion: String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(version) (\(build))"
    }

    private func openNotificationSettings() {
        if let url = URL(string: UIApplication.openNotificationSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }
}

#Preview {
    SettingsView()
}
