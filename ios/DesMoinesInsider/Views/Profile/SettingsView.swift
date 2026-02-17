import SwiftUI
import StoreKit

/// App settings view with account management, subscription, and about sections.
struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = true

    @State private var auth = AuthService.shared
    @State private var storeKit = StoreKitService.shared
    @State private var showSubscription = false
    @State private var showDeleteConfirmation = false
    @State private var isDeleting = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            List {
                // Account section (authenticated users only)
                if auth.isAuthenticated {
                    Section("Account") {
                        Button {
                            showSubscription = true
                        } label: {
                            HStack {
                                Label("Subscription", systemImage: "star.circle")
                                Spacer()
                                Text(storeKit.currentTier.displayName)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                Image(systemName: "chevron.right")
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                            }
                        }

                        Button {
                            Task {
                                await storeKit.restorePurchases()
                            }
                        } label: {
                            Label("Restore Purchases", systemImage: "arrow.clockwise")
                        }
                    }
                }

                Section("General") {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text(appVersion)
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Version \(appVersion)")
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

                    NavigationLink {
                        WebViewPage(
                            title: "Privacy Policy",
                            url: Config.siteURL.appendingPathComponent("privacy-policy")
                        )
                    } label: {
                        Label("Privacy Policy", systemImage: "hand.raised")
                    }

                    NavigationLink {
                        WebViewPage(
                            title: "Terms of Service",
                            url: Config.siteURL.appendingPathComponent("terms")
                        )
                    } label: {
                        Label("Terms of Service", systemImage: "doc.text")
                    }

                    Button {
                        requestAppReview()
                    } label: {
                        Label("Rate Des Moines Insider", systemImage: "star.bubble")
                    }
                }

                // Data & Privacy section (authenticated users only)
                if auth.isAuthenticated {
                    Section("Data & Privacy") {
                        Button(role: .destructive) {
                            showDeleteConfirmation = true
                        } label: {
                            Label {
                                if isDeleting {
                                    Text("Deleting Account...")
                                } else {
                                    Text("Delete Account")
                                }
                            } icon: {
                                if isDeleting {
                                    ProgressView()
                                } else {
                                    Image(systemName: "trash")
                                }
                            }
                            .foregroundStyle(.red)
                        }
                        .disabled(isDeleting)
                        .accessibilityLabel("Delete your account")
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
            .sheet(isPresented: $showSubscription) {
                SubscriptionView()
            }
            .alert("Delete Account?", isPresented: $showDeleteConfirmation) {
                Button("Delete", role: .destructive) {
                    Task { await deleteAccount() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This will permanently delete your account, favorites, and all associated data. This action cannot be undone.")
            }
            .alert("Error", isPresented: .init(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    // MARK: - Helpers

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

    private func requestAppReview() {
        guard let scene = UIApplication.shared.connectedScenes
            .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene else {
            return
        }
        AppStore.requestReview(in: scene)
    }

    private func deleteAccount() async {
        isDeleting = true
        errorMessage = nil

        do {
            guard let client = SupabaseService.shared.client else {
                throw NSError(domain: "Settings", code: -1,
                              userInfo: [NSLocalizedDescriptionKey: "Supabase is not configured."])
            }

            // invoke returns Void in supabase-swift 2.x; throws on failure
            try await client.functions.invoke(
                "delete-user-account",
                options: .init(method: .post)
            )

            try await auth.signOut()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }

        isDeleting = false
    }
}

#Preview {
    SettingsView()
}
