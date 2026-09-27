import SwiftUI
import StoreKit
import CoreSpotlight

@main
struct DesMoinesInsiderApp: App {
    /// Installs the APNs / notification delegate so push registration and
    /// notification taps actually work (IOS-AUDIT-FEAT-001 / FEAT-003).
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    @Environment(\.scenePhase) private var scenePhase

    @State private var authService = AuthService.shared
    @State private var favoritesService = FavoritesService.shared
    @State private var locationService = LocationService.shared
    @State private var biometricService = BiometricAuthService.shared
    @State private var consent = ConsentService.shared
    @State private var sessionTimeout = SessionTimeoutService.shared
    @State private var versionCheck = VersionCheckService.shared

    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false
    @AppStorage("appLaunchCount") private var launchCount = 0
    @AppStorage("themeMode") private var themeModeRaw: String = ThemeMode.system.rawValue
    @State private var showJailbreakWarning = false
    /// Starts true when the user turned the lock on (the flag is only ever set
    /// while signed in), so the lock is in place before the first
    /// authenticated frame. It used to be set at the end of the launch .task,
    /// after several network awaits and only if the auth listener had already
    /// finished: either MainTabView showed first or the lock was skipped for
    /// the whole launch (IOS-DD-ACCOUNT-05). Cleared once auth settles signed
    /// out.
    @State private var awaitingBiometric = BiometricAuthService.shared.isEnabled
    @State private var sessionExpiredMessage: String?
    /// Tracks in-session consent completion. ConsentService stores its state in
    /// UserDefaults via computed properties, which `@Observable` cannot track, so
    /// mutating `hasCompletedConsent` does not re-evaluate `needsConsentPrompt`
    /// below. This locally-observed flag advances the gate once the user chooses
    /// (IOS-AUDIT-FEAT-015). The persisted flag still suppresses the prompt on
    /// the next launch.
    @State private var consentCompleted = false

    /// MetricKit subscriber — retained for the lifetime of the app.
    private let metricKit = MetricKitSubscriber.shared

    private var themeMode: ThemeMode {
        ThemeMode(rawValue: themeModeRaw) ?? .system
    }

    var body: some Scene {
        WindowGroup {
            ThemeCrossfadeContainer(mode: themeMode) {
            Group {
                if !Config.isConfigured {
                    // Supabase credentials are missing — show a helpful error
                    // instead of crashing (the old fatalError behaviour).
                    ConfigurationErrorView(
                        error: SupabaseService.shared.configurationError
                            ?? "Supabase credentials are missing."
                    )
                } else if versionCheck.forceUpgrade {
                    // Binary is below the server's minimum-supported version —
                    // block until the user updates (IOS-AUDIT-REL-001).
                    ForceUpdateView(message: versionCheck.message, storeURL: versionCheck.storeURL)
                } else if authService.isLoading {
                    LaunchScreenView()
                } else if !hasCompletedOnboarding {
                    OnboardingView(hasCompletedOnboarding: $hasCompletedOnboarding)
                } else if consent.needsConsentPrompt && !consentCompleted {
                    ConsentView { consentCompleted = true }
                } else if awaitingBiometric && authService.isAuthenticated {
                    BiometricLockView {
                        awaitingBiometric = false
                    }
                } else if authService.isAuthenticated && authService.needsPasswordReset {
                    // Arrived through a reset link (IOS-DD-ACCOUNT-07).
                    SetNewPasswordView()
                } else if authService.isAuthenticated && authService.needsEmailVerification {
                    VerifyEmailView()
                } else {
                    MainTabView()
                        .safeAreaInset(edge: .top, spacing: 0) {
                            SessionTimeoutBanner(state: sessionTimeout.sessionState) {
                                sessionTimeout.recordActivity()
                            }
                        }
                }
            }
            // App-switcher snapshot cover. The lock re-engages on .background,
            // but iOS takes the snapshot while the app is still showing
            // content, so the content is hidden whenever the scene is not
            // active (IOS-DD-ACCOUNT-05).
            .overlay {
                if scenePhase != .active && biometricService.isEnabled && authService.isAuthenticated {
                    PrivacyCoverView()
                }
            }
            .alert("Security Warning", isPresented: $showJailbreakWarning) {
                Button("I Understand", role: .cancel) {}
            } message: {
                Text("This device may have been modified. Your data could be at risk. We recommend using an unmodified device for the best security.")
            }
            .alert(
                "Signed Out",
                // Also carries the cold-launch expiry, which AuthService now
                // decides in its listener (IOS-DD-ACCOUNT-02).
                isPresented: Binding(
                    get: { signedOutMessage != nil },
                    set: { if !$0 { clearSignedOutMessage() } }
                ),
                actions: {
                    Button("OK", role: .cancel) { clearSignedOutMessage() }
                },
                message: {
                    Text(signedOutMessage ?? "")
                }
            )
            .onChange(of: authService.isLoading) { _, _ in settleBiometricGate() }
            .onChange(of: authService.isAuthenticated) { _, _ in settleBiometricGate() }
            .onChange(of: sessionTimeout.sessionState) { _, newState in
                guard case .expired = newState, authService.isAuthenticated else { return }
                Task {
                    sessionExpiredMessage = "You were signed out for inactivity. Sign in again to continue."
                    try? await authService.signOut()
                }
            }
            .onChange(of: scenePhase) { _, newPhase in
                switch newPhase {
                case .background:
                    // Lock on the way out, so the next foreground shows the
                    // lock rather than content (IOS-AUDIT-SEC-016,
                    // IOS-DD-ACCOUNT-05). A transient .inactive (Control
                    // Center, the Face ID sheet) never gets here.
                    if biometricService.isEnabled && authService.isAuthenticated {
                        awaitingBiometric = true
                    }
                case .active:
                    // Admin sessions: judge the time spent away before counting
                    // the return as activity (IOS-DD-ACCOUNT-02).
                    if authService.isAuthenticated {
                        sessionTimeout.noteForeground()
                    }
                default:
                    break
                }
            }
            .onOpenURL { url in
                // A reset link arrives as an ordinary auth callback under
                // PKCE; note it before the SDK consumes it (IOS-DD-ACCOUNT-07).
                authService.noteAuthCallback(url)
                // Handle auth callbacks (email verification, OAuth redirects, etc.)
                SupabaseService.shared.client?.handle(url)
                // Then route content deep links (events/restaurants/attractions);
                // auth-callback URLs are ignored by the handler (IOS-AUDIT-FEAT-002).
                DeepLinkHandler.shared.handle(url)
            }
            .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                // Universal links (https://desmoinesinsider.com/...) (IOS-AUDIT-FEAT-002).
                if let url = activity.webpageURL {
                    DeepLinkHandler.shared.handle(url)
                }
            }
            .onContinueUserActivity(CSSearchableItemActionType) { activity in
                // Spotlight result tap → route to the item's detail screen
                // (IOS-AUDIT-FEAT-027). MainTabView observes pendingDestination.
                if let id = activity.userInfo?[CSSearchableItemActivityIdentifier] as? String {
                    DeepLinkHandler.shared.handleSpotlightIdentifier(id)
                }
            }
            .task {
                launchCount += 1
                settleBiometricGate()

                // Install crash/non-fatal capture handlers as early as possible so
                // an early-launch crash is still recorded (IOS-AUDIT-FEAT-010).
                CrashReportingService.shared.configure()
                if authService.isAuthenticated, let uid = authService.currentUser?.id.uuidString {
                    CrashReportingService.shared.setUserId(uid)
                }

                // Drain whatever the previous run recorded. Every crash since
                // IOS-AUDIT-FEAT-010 has been captured to disk and never sent
                // anywhere; this is the upload half (XPLAT-004 AC1). Silent on
                // failure, and records survive a failed attempt.
                await CrashUploader.uploadPending()

                // Launch-time minimum-supported-version gate (IOS-AUDIT-REL-001).
                // Fails open, so a backend hiccup never blocks a supported build.
                await versionCheck.checkOnLaunch()

                // One-time migration of Keychain items to the stricter
                // WhenUnlockedThisDeviceOnly accessibility flag. Runs before
                // any Keychain reads (BiometricAuthService, session checks).
                KeychainService.shared.migrateAccessibilityIfNeeded()

                // Prune expired cache entries on launch
                await QueryCache.shared.pruneExpired()

                // Flush any ad telemetry that queued while offline (IOS-ADS-014).
                await AdTrackingService.shared.flushPendingEvents()

                // Jailbreak check (soft warning, non-blocking)
                if JailbreakDetector.isJailbroken {
                    showJailbreakWarning = true
                }

                // The cold-launch timeout check moved into AuthService's
                // .initialSession handler, and the biometric gate is set at
                // init (IOS-DD-ACCOUNT-02 / -05). Both raced the auth listener
                // from here.

                if authService.isAuthenticated {
                    await favoritesService.loadFavorites()

                    // Request review after engagement thresholds
                    await requestReviewIfEligible()
                }

                // Deliberate, one-time push-permission prompt after onboarding
                // (IOS-AUDIT-FEAT-001) — not only when a saved-search alert is
                // enabled. Gated on the feature flag; never re-prompts a user
                // who already decided.
                if Config.enablePushNotifications, hasCompletedOnboarding, authService.isAuthenticated {
                    await PushNotificationService.shared.requestPermissionIfAppropriate()
                }
            }
            } // ThemeCrossfadeContainer
        }
    }

    // MARK: - Signed-out message

    private var signedOutMessage: String? {
        sessionExpiredMessage ?? authService.launchSignOutMessage
    }

    private func clearSignedOutMessage() {
        sessionExpiredMessage = nil
        authService.launchSignOutMessage = nil
    }

    /// Drops the launch-time lock once auth has settled signed out: there is
    /// no session to protect, and a later in-app sign-in must not land on a
    /// stale lock.
    private func settleBiometricGate() {
        if !authService.isLoading && !authService.isAuthenticated {
            awaitingBiometric = false
        }
    }

    // MARK: - App Review

    private func requestReviewIfEligible() async {
        // Require at least 3 launches and 1+ favorites before prompting
        guard launchCount >= 3,
              favoritesService.favoriteEventIds.count + favoritesService.favoriteRestaurantIds.count >= 1
        else { return }

        // Only prompt once (AppStore rate-limits this, but we gate on our side too)
        guard !UserDefaults.standard.bool(forKey: "hasRequestedReview") else { return }

        // Delay slightly so the app is fully visible. Structured + cancellable
        // with the view's .task — no fire-and-forget asyncAfter on the launch
        // path (IOS-AUDIT-PERF-013).
        try? await Task.sleep(for: .seconds(2))
        guard !Task.isCancelled else { return }

        // Only prompt when a foreground-active scene still exists, and only mark
        // as requested once we actually show it.
        guard let scene = UIApplication.shared.connectedScenes
            .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene else {
            return
        }
        UserDefaults.standard.set(true, forKey: "hasRequestedReview")
        AppStore.requestReview(in: scene)
    }
}

// MARK: - Launch Screen

private struct LaunchScreenView: View {
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 24) {
                Image("AppLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 220)
                    .accessibilityLabel("Des Moines Insider")

                ProgressView()
                    .tint(Color.accentColor)
                    .accessibilityLabel("Loading")
            }
        }
        // Black background regardless of theme, so semantic colors must
        // resolve for dark or secondary text vanishes (IOS-DD-ACCOUNT-14).
        .environment(\.colorScheme, .dark)
    }
}

// MARK: - Privacy cover

/// Covers the app while the scene is inactive or in the background, so the
/// app-switcher snapshot of a biometric-locked app shows no content
/// (IOS-DD-ACCOUNT-05).
private struct PrivacyCoverView: View {
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            Image("AppLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 180)
                .accessibilityLabel("Des Moines Insider")
        }
        .environment(\.colorScheme, .dark)
    }
}

// MARK: - Biometric Lock Screen

/// Shown when biometric auth is enabled and the user needs to verify their identity.
///
/// SECURITY: This view does NOT offer a "Skip" option — bypassing biometric auth
/// would defeat its purpose. Users who can't authenticate must sign out and
/// re-enter their email/password. After `maxFailedAttempts` retries the retry
/// button is disabled to discourage brute-forcing.
private struct BiometricLockView: View {
    let onUnlock: () -> Void

    @State private var biometric = BiometricAuthService.shared
    @State private var auth = AuthService.shared
    @State private var isAuthenticating = false
    @State private var failedAttempts = 0
    @State private var isSigningOut = false
    /// One automatic prompt per trip to the foreground. Without it, dismissing
    /// the prompt (which briefly makes the scene inactive) would re-prompt on
    /// the return to .active, forever.
    @State private var autoPromptPending = true
    @Environment(\.scenePhase) private var scenePhase

    private let maxFailedAttempts = 3

    private var isRetryDisabled: Bool {
        isAuthenticating || failedAttempts >= maxFailedAttempts
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 32) {
                Image(systemName: biometric.biometricIcon)
                    .font(.system(size: 64))
                    .foregroundStyle(Color.accentColor)
                    .accessibilityHidden(true)

                Text("Locked")
                    .font(.title.bold())
                    .foregroundStyle(.white)

                Text(promptMessage)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                Button {
                    Task { await attemptAuthentication() }
                } label: {
                    Label("Try Again", systemImage: biometric.biometricIcon)
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(isRetryDisabled ? Color.gray.opacity(0.4) : Color.accentColor)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .disabled(isRetryDisabled)
                .padding(.horizontal, 48)
                .accessibilityLabel("Authenticate with \(biometric.biometricName)")

                Button(role: .destructive) {
                    Task { await signOutAndReturnToLogin() }
                } label: {
                    Text(isSigningOut ? "Signing out…" : "Sign Out")
                        .font(.subheadline.weight(.semibold))
                }
                .disabled(isSigningOut)
                .foregroundStyle(.white.opacity(0.85))
                .accessibilityLabel("Sign out")
            }
        }
        .environment(\.colorScheme, .dark)
        .task {
            // Auto-invoke the prompt so the user doesn't need an extra tap,
            // but only while active: the lock is now set on .background, and
            // evaluatePolicy from the background fails (IOS-DD-ACCOUNT-05).
            await autoPromptIfNeeded()
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .background:
                autoPromptPending = true
            case .active:
                Task { await autoPromptIfNeeded() }
            default:
                break
            }
        }
    }

    private func autoPromptIfNeeded() async {
        guard scenePhase == .active, autoPromptPending, failedAttempts == 0, !isAuthenticating else { return }
        autoPromptPending = false
        await attemptAuthentication()
    }

    private var promptMessage: String {
        if failedAttempts >= maxFailedAttempts {
            return "Too many failed attempts. Sign out and use your password to continue."
        }
        return "Unlock with \(biometric.biometricName) or your passcode"
    }

    private func attemptAuthentication() async {
        guard !isRetryDisabled else { return }
        isAuthenticating = true
        // Passcode fallback included (.deviceOwnerAuthentication), and a
        // cancel no longer counts toward the retry limit (IOS-DD-ACCOUNT-05).
        let outcome = await biometric.evaluate()
        isAuthenticating = false
        switch outcome {
        case .success:
            failedAttempts = 0
            onUnlock()
        case .cancelled, .failed, .unavailable:
            if BiometricAuthService.countsAsFailure(outcome) {
                failedAttempts += 1
            }
        }
    }

    private func signOutAndReturnToLogin() async {
        isSigningOut = true
        try? await auth.signOut()
        // Sign-out flips isAuthenticated → false, which routes the app shell
        // away from BiometricLockView automatically. We still call onUnlock so
        // the awaitingBiometric flag clears in the parent.
        onUnlock()
        isSigningOut = false
    }
}

// MARK: - Configuration Error

/// Displayed when Supabase credentials are not injected at build time.
/// This replaces the old `fatalError()` crash with a user-visible message.
private struct ConfigurationErrorView: View {
    let error: String

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 24) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(.yellow)
                    .accessibilityHidden(true)

                Text("Configuration Error")
                    .font(.title2.bold())
                    .foregroundStyle(.white)

                Text(error)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                Text("Please reinstall the app or contact support at \(Config.supportEmail).")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
        }
        .environment(\.colorScheme, .dark)
    }
}
