import SwiftUI
import StoreKit
import UserNotifications

/// App settings view with account management, subscription, and about sections.
struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = true

    @State private var auth = AuthService.shared
    @State private var storeKit = StoreKitService.shared
    @State private var biometric = BiometricAuthService.shared
    @State private var notifications = LocalNotificationService.shared
    @State private var showSubscription = false
    @State private var showDeleteConfirmation = false
    @State private var isDeleting = false
    @State private var errorMessage: String?
    @State private var notificationStatus: UNAuthorizationStatus = .notDetermined

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

                    if biometric.isAvailable {
                        Section("Security") {
                            Toggle(isOn: Binding(
                                get: { biometric.isEnabled },
                                set: { newValue in
                                    Task {
                                        if newValue {
                                            _ = await biometric.enable()
                                        } else {
                                            biometric.disable()
                                        }
                                    }
                                }
                            )) {
                                Label(biometric.biometricName, systemImage: biometric.biometricIcon)
                            }
                            .accessibilityLabel("Sign in with \(biometric.biometricName)")
                            .accessibilityHint(biometric.isEnabled ? "Currently enabled" : "Currently disabled")
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
                    HStack {
                        Label("Permission", systemImage: "bell")
                        Spacer()
                        Text(notificationStatusText)
                            .font(.subheadline)
                            .foregroundStyle(notificationStatus == .authorized ? .green : .secondary)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Notification permission: \(notificationStatusText)")

                    if notificationStatus == .denied {
                        Button {
                            openNotificationSettings()
                        } label: {
                            Label("Open iOS Settings", systemImage: "gear")
                        }
                    } else if notificationStatus == .notDetermined {
                        Button {
                            Task { await requestNotificationPermission() }
                        } label: {
                            Label("Enable Notifications", systemImage: "bell.badge")
                        }
                    }

                    if notificationStatus == .authorized {
                        @AppStorage("eventRemindersEnabled") var remindersEnabled = true
                        Toggle(isOn: Binding(
                            get: { UserDefaults.standard.bool(forKey: "eventRemindersEnabled") },
                            set: { UserDefaults.standard.set($0, forKey: "eventRemindersEnabled") }
                        )) {
                            Label("Event Reminders", systemImage: "calendar.badge.clock")
                        }

                        HStack {
                            Label("Scheduled Reminders", systemImage: "clock")
                            Spacer()
                            Text("\(notifications.scheduledEventIds.count)")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .task { await checkNotificationStatus() }

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
                    Section("Privacy & Data") {
                        Toggle(isOn: Binding(
                            get: { ConsentService.shared.locationConsent },
                            set: { ConsentService.shared.locationConsent = $0 }
                        )) {
                            Label("Location Data", systemImage: "location")
                        }

                        Toggle(isOn: Binding(
                            get: { ConsentService.shared.emailConsent },
                            set: { ConsentService.shared.emailConsent = $0 }
                        )) {
                            Label("Email Communications", systemImage: "envelope")
                        }

                        Toggle(isOn: Binding(
                            get: { ConsentService.shared.analyticsConsent },
                            set: { ConsentService.shared.analyticsConsent = $0 }
                        )) {
                            Label("Analytics", systemImage: "chart.bar")
                        }
                    }

                    Section("Account") {
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

    private var notificationStatusText: String {
        switch notificationStatus {
        case .authorized: return "Enabled"
        case .denied: return "Disabled"
        case .notDetermined: return "Not Set"
        case .provisional: return "Provisional"
        case .ephemeral: return "Temporary"
        @unknown default: return "Unknown"
        }
    }

    private func checkNotificationStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        notificationStatus = settings.authorizationStatus
    }

    private func requestNotificationPermission() async {
        let center = UNUserNotificationCenter.current()
        let granted = try? await center.requestAuthorization(options: [.alert, .badge, .sound])
        if granted == true {
            notificationStatus = .authorized
        }
        await checkNotificationStatus()
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
