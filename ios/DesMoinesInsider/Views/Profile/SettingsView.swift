import SwiftUI
import StoreKit
import UserNotifications

/// App settings view with account management, subscription, and about sections.
struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = true
    /// Read by DesMoinesInsiderApp's ThemeCrossfadeContainer; nothing wrote it
    /// until this picker (IOS-DD-ACCOUNT-16).
    @AppStorage("themeMode") private var themeModeRaw = ThemeMode.system.rawValue

    @State private var auth = AuthService.shared
    @State private var storeKit = StoreKitService.shared
    @State private var biometric = BiometricAuthService.shared
    @State private var notifications = LocalNotificationService.shared
    /// Held as @State so `$consent.x` bindings observe the service; the old
    /// Binding(get:set:) closures read UserDefaults and never redrew
    /// (IOS-DD-ACCOUNT-11).
    @State private var consent = ConsentService.shared
    @State private var emailPreferences = EmailPreferencesService.shared
    @State private var toast: ToastMessage?
    /// Set after a deletion that left a store subscription billing; the sheet
    /// dismisses once it is acknowledged (IOS-DD-ACCOUNT-08).
    @State private var postDeletionNotice: String?
    @State private var lastDeletionError: AccountDeletionService.DeletionError?
    @Environment(\.openURL) private var openURL
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

                    // Shown when enabled even if biometrics went away (e.g. Face
                    // ID was reset), so the user can still turn it off
                    // (IOS-DD-ACCOUNT-05).
                    if biometric.isAvailable || biometric.isEnabled {
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
                    Picker(selection: $themeModeRaw) {
                        ForEach(ThemeMode.allCases) { mode in
                            Text(mode.displayName).tag(mode.rawValue)
                        }
                    } label: {
                        Label("Appearance", systemImage: "circle.lefthalf.filled")
                    }

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
                        // IOS-AUDIT-BUG-012: bound to the service, not straight to
                        // UserDefaults. The key is the same one, so an existing
                        // preference survives - what changed is that something now
                        // READS it: scheduleReminder refuses while this is off, and
                        // switching it off cancels what is already pending.
                        Toggle(isOn: $notifications.remindersEnabled) {
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
                    Toggle(isOn: $consent.analyticsConsent) {
                        Label("Usage Analytics", systemImage: "chart.bar")
                    }
                } header: {
                    Text("Privacy")
                } footer: {
                    Text("Help improve the app with anonymous usage and ad-performance analytics. You can turn this off anytime.")
                }

                // Data & Privacy section (authenticated users only)
                if auth.isAuthenticated {
                    signedInPrivacySections
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
            .toastOverlay(message: $toast)
            .alert("Delete Account?", isPresented: $showDeleteConfirmation) {
                Button("Delete", role: .destructive) {
                    Task { await deleteAccount() }
                }
                if storeKit.hasAppStoreSubscription {
                    Button("Manage Subscription") {
                        Task { await storeKit.showManageSubscriptions() }
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text(AccountDeletionService.confirmationMessage(hasAppStoreSubscription: storeKit.hasAppStoreSubscription))
            }
            .alert("Account Deleted", isPresented: .init(
                get: { postDeletionNotice != nil },
                set: { if !$0 { postDeletionNotice = nil } }
            )) {
                Button("Manage Subscription") {
                    postDeletionNotice = nil
                    Task {
                        await storeKit.showManageSubscriptions()
                        dismiss()
                    }
                }
                Button("OK", role: .cancel) {
                    postDeletionNotice = nil
                    dismiss()
                }
            } message: {
                Text(postDeletionNotice ?? "")
            }
            // IOS-AUDIT-BUG-018 AC3. This alert has exactly one setter - the
            // deletion catch below - so the retry is unambiguous here and needs
            // no discriminator, unlike ProfileView where it is shared.
            .alert("Couldn't Delete Account", isPresented: .init(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                if lastDeletionError?.offersManageSubscription == true {
                    // Refused because a subscription is still live; a retry
                    // cannot succeed until that is dealt with.
                    Button("Manage Subscription") {
                        openURL(Config.siteURL.appendingPathComponent("subscription"))
                    }
                } else {
                    Button("Try Again") {
                        Task { await deleteAccount() }
                    }
                }
                Button("Cancel", role: .cancel) {}
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

    // MARK: - Signed-in sections

    /// Split out of `body` to keep its type-check time down.
    @ViewBuilder
    private var signedInPrivacySections: some View {
        Section {
            Toggle(isOn: $consent.locationConsent) {
                Label("Location Data", systemImage: "location")
            }
        } header: {
            Text("Privacy & Data")
        } footer: {
            Text("Controls whether your location is sent to our weather provider. Location access itself is set in iOS Settings.")
        }

        // The digest preference the server actually reads
        // (user_email_preferences), replacing a device-only
        // "Email Communications" switch (IOS-DD-ACCOUNT-10).
        Section {
            Toggle(isOn: Binding(
                get: { emailPreferences.weeklyDigestEnabled ?? false },
                set: { newValue in
                    Task {
                        do {
                            try await emailPreferences.setWeeklyDigest(newValue)
                        } catch {
                            toast = .error("Couldn't update your email preference. Try again.")
                        }
                    }
                }
            )) {
                Label("Weekly picks email", systemImage: "envelope")
            }
            .disabled(emailPreferences.weeklyDigestEnabled == nil)
        } footer: {
            Text("The Sunday email with this week's best events. Also controllable on the website.")
        }
        .task { await emailPreferences.load() }

        Section {
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
        } header: {
            Text("Delete Account")
        } footer: {
            Text("Deletes your account, profile, saved items and preferences. It cannot be undone.")
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
        // Re-authenticate first; a cancel just returns (IOS-DD-ACCOUNT-08).
        guard await AccountDeletionService.confirmIdentity() else { return }

        isDeleting = true
        errorMessage = nil
        lastDeletionError = nil

        do {
            // XPLAT-001 / IOS-AUDIT-BUG-018: shared with ProfileViewModel so the
            // two deletion entry points cannot drift apart again.
            // IOS-AUDIT-BUG-018 AC2: sign-out moved into the service and made
            // best effort, so dismiss() now runs whenever the account is actually
            // gone rather than being skipped by a sign-out blip.
            let result = try await AccountDeletionService.shared.deleteAccountAndSignOut()
            if let notice = AccountDeletionService.notice(for: result.storeSubscriptionsStillActive) {
                // Dismissed from the alert once read.
                postDeletionNotice = notice
            } else {
                dismiss()
            }
        } catch {
            errorMessage = error.localizedDescription
            lastDeletionError = error as? AccountDeletionService.DeletionError
        }

        isDeleting = false
    }
}

#Preview {
    SettingsView()
}
