import SwiftUI
import StoreKit

@main
struct DesMoinesInsiderApp: App {
    @State private var authService = AuthService.shared
    @State private var favoritesService = FavoritesService.shared
    @State private var locationService = LocationService.shared
    @State private var biometricService = BiometricAuthService.shared
    @State private var consent = ConsentService.shared
    @State private var sessionTimeout = SessionTimeoutService.shared

    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false
    @AppStorage("appLaunchCount") private var launchCount = 0
    @State private var showJailbreakWarning = false
    @State private var awaitingBiometric = false
    @State private var sessionExpiredMessage: String?

    /// MetricKit subscriber — retained for the lifetime of the app.
    private let metricKit = MetricKitSubscriber.shared

    var body: some Scene {
        WindowGroup {
            Group {
                if !Config.isConfigured {
                    // Supabase credentials are missing — show a helpful error
                    // instead of crashing (the old fatalError behaviour).
                    ConfigurationErrorView(
                        error: SupabaseService.shared.configurationError
                            ?? "Supabase credentials are missing."
                    )
                } else if authService.isLoading {
                    LaunchScreenView()
                } else if !hasCompletedOnboarding {
                    OnboardingView(hasCompletedOnboarding: $hasCompletedOnboarding)
                } else if consent.needsConsentPrompt {
                    ConsentView { }
                } else if awaitingBiometric {
                    BiometricLockView {
                        awaitingBiometric = false
                    }
                } else {
                    MainTabView()
                        .safeAreaInset(edge: .top, spacing: 0) {
                            SessionTimeoutBanner(state: sessionTimeout.sessionState) {
                                sessionTimeout.recordActivity()
                            }
                        }
                }
            }
            .alert("Security Warning", isPresented: $showJailbreakWarning) {
                Button("I Understand", role: .cancel) {}
            } message: {
                Text("This device may have been modified. Your data could be at risk. We recommend using an unmodified device for the best security.")
            }
            .alert(
                "Signed Out",
                isPresented: Binding(
                    get: { sessionExpiredMessage != nil },
                    set: { if !$0 { sessionExpiredMessage = nil } }
                ),
                actions: {
                    Button("OK", role: .cancel) { sessionExpiredMessage = nil }
                },
                message: {
                    Text(sessionExpiredMessage ?? "")
                }
            )
            .onChange(of: sessionTimeout.sessionState) { _, newState in
                guard case .expired = newState, authService.isAuthenticated else { return }
                Task {
                    sessionExpiredMessage = "You were signed out for inactivity. Sign in again to continue."
                    try? await authService.signOut()
                }
            }
            .onOpenURL { url in
                // Handle auth callbacks (email verification, OAuth redirects, etc.)
                SupabaseService.shared.client?.handle(url)
            }
            .task {
                launchCount += 1

                // Prune expired cache entries on launch
                await QueryCache.shared.pruneExpired()

                // Jailbreak check (soft warning, non-blocking)
                if JailbreakDetector.isJailbroken {
                    showJailbreakWarning = true
                }

                // Cold-launch session validity check: if the persisted timestamps
                // show the session is past its idle/absolute window, sign out
                // before any authenticated UI renders.
                if authService.isAuthenticated, !sessionTimeout.isSessionValid() {
                    sessionExpiredMessage = "Your session expired while the app was closed. Please sign in again."
                    try? await authService.signOut()
                }

                // Biometric auth on launch (if enabled and user has a session).
                // The actual prompt is owned by BiometricLockView's .task so
                // we don't fire two simultaneous evaluatePolicy calls.
                if biometricService.isEnabled && authService.isAuthenticated {
                    awaitingBiometric = true
                }

                if authService.isAuthenticated {
                    await favoritesService.loadFavorites()

                    // Request review after engagement thresholds
                    requestReviewIfEligible()
                }
            }
        }
    }

    // MARK: - App Review

    private func requestReviewIfEligible() {
        // Require at least 3 launches and 1+ favorites before prompting
        guard launchCount >= 3,
              favoritesService.favoriteEventIds.count + favoritesService.favoriteRestaurantIds.count >= 1
        else { return }

        // Only prompt once (AppStore rate-limits this, but we gate on our side too)
        guard !UserDefaults.standard.bool(forKey: "hasRequestedReview") else { return }
        UserDefaults.standard.set(true, forKey: "hasRequestedReview")

        // Delay slightly so the app is fully visible
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            guard let scene = UIApplication.shared.connectedScenes
                .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene else {
                return
            }
            AppStore.requestReview(in: scene)
        }
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
                .accessibilityLabel("Sign out and use password to re-authenticate")
            }
        }
        .task {
            // Auto-invoke biometric prompt on first appear so the user doesn't
            // need an extra tap. Subsequent retries go through the button.
            if failedAttempts == 0 {
                await attemptAuthentication()
            }
        }
    }

    private var promptMessage: String {
        if failedAttempts >= maxFailedAttempts {
            return "Too many failed attempts. Sign out and use your password to continue."
        }
        return "Authenticate with \(biometric.biometricName) to continue."
    }

    private func attemptAuthentication() async {
        guard !isRetryDisabled else { return }
        isAuthenticating = true
        let success = await biometric.authenticate()
        isAuthenticating = false
        if success {
            failedAttempts = 0
            onUnlock()
        } else {
            failedAttempts += 1
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
    }
}
