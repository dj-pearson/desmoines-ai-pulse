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
    @State private var showOfferCodeRedeem = false
    @State private var showDeleteConfirmation = false
    @State private var isDeleting = false
    @State private var isRestoring = false
    @State private var restoreResultMessage: String?
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
                            Task { await restorePurchases() }
                        } label: {
                            Label {
                                Text(isRestoring ? "Restoring…" : "Restore Purchases")
                            } icon: {
                                if isRestoring {
                                    ProgressView()
                                } else {
                                    Image(systemName: "arrow.clockwise")
                                }
                            }
                        }
                        .disabled(isRestoring)
                        .accessibilityLabel("Restore previous purchases")

                        // Offer-code redemption — win-back / promo codes (IOS-SUB-014)
                        Button {
                            AnalyticsService.shared.trackOfferCodeRedeem(action: "open")
                            showOfferCodeRedeem = true
                        } label: {
                            Label("Redeem Offer Code", systemImage: "tag")
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
                        // The toggle drives UserDefaults directly via the binding
                        // below; no separate @AppStorage local (which wouldn't be
                        // installed as view state anyway) — IOS-AUDIT-UX-029.
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

                // Analytics/ad-telemetry opt-out, available to EVERY user — not
                // just EU (who get the consent prompt) or authenticated users
                // (IOS-AUDIT-SEC-014). AnalyticsService + AdTrackingService both
                // gate on this flag.
                Section {
                    Toggle(isOn: Binding(
                        get: { ConsentService.shared.analyticsConsent },
                        set: { ConsentService.shared.analyticsConsent = $0 }
                    )) {
                        Label("Usage Analytics", systemImage: "chart.bar")
                    }
                } header: {
                    Text("Privacy")
                } footer: {
                    Text("Help improve the app with anonymous usage and ad-performance analytics. You can turn this off anytime.")
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
            .offerCodeRedemption(isPresented: $showOfferCodeRedeem) { result in
                switch result {
                case .success:
                    AnalyticsService.shared.trackOfferCodeRedeem(action: "success")
                    Task { await storeKit.refreshRenewalState() }
                case .failure:
                    AnalyticsService.shared.trackOfferCodeRedeem(action: "failure")
                }
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
            .alert("Restore Purchases", isPresented: .init(
                get: { restoreResultMessage != nil },
                set: { if !$0 { restoreResultMessage = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(restoreResultMessage ?? "")
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

    /// Restores previous purchases and reports the outcome. Distinguishes a
    /// genuine restore failure (e.g. AppStore.sync network error) from a
    /// successful sync that simply found no active subscription
    /// (IOS-AUDIT-FEAT-016).
    private func restorePurchases() async {
        isRestoring = true
        await storeKit.restorePurchases()
        isRestoring = false

        if let error = storeKit.errorMessage {
            // restorePurchases() sets errorMessage only when AppStore.sync fails.
            restoreResultMessage = error
        } else if storeKit.currentTier != .free {
            restoreResultMessage = "Your \(storeKit.currentTier.displayName) subscription has been restored."
        } else {
            restoreResultMessage = "No previous purchases were found to restore."
        }
    }

    private func deleteAccount() async {
        isDeleting = true
        errorMessage = nil

        do {
            // XPLAT-001 / IOS-AUDIT-BUG-018: shared with ProfileViewModel so the
            // two deletion entry points cannot drift apart again.
            try await AccountDeletionService.shared.deleteAccount()

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
