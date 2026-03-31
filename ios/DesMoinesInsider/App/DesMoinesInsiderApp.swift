import SwiftUI
import StoreKit

@main
struct DesMoinesInsiderApp: App {
    @State private var authService = AuthService.shared
    @State private var favoritesService = FavoritesService.shared
    @State private var locationService = LocationService.shared
    @State private var biometricService = BiometricAuthService.shared

    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false
    @AppStorage("appLaunchCount") private var launchCount = 0
    @State private var showJailbreakWarning = false
    @State private var awaitingBiometric = false

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
                } else if awaitingBiometric {
                    BiometricLockView {
                        awaitingBiometric = false
                    }
                } else {
                    MainTabView()
                }
            }
            .alert("Security Warning", isPresented: $showJailbreakWarning) {
                Button("I Understand", role: .cancel) {}
            } message: {
                Text("This device may have been modified. Your data could be at risk. We recommend using an unmodified device for the best security.")
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

                // Biometric auth on launch (if enabled and user has a session)
                if biometricService.isEnabled && authService.isAuthenticated {
                    awaitingBiometric = true
                    let success = await biometricService.authenticate()
                    if success {
                        awaitingBiometric = false
                    }
                    // If biometric fails, user stays on lock screen with retry button
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
private struct BiometricLockView: View {
    let onUnlock: () -> Void

    @State private var biometric = BiometricAuthService.shared
    @State private var isAuthenticating = false

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

                Text("Authenticate with \(biometric.biometricName) to continue")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                Button {
                    Task {
                        isAuthenticating = true
                        let success = await biometric.authenticate()
                        if success {
                            onUnlock()
                        }
                        isAuthenticating = false
                    }
                } label: {
                    Label("Try Again", systemImage: biometric.biometricIcon)
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.accentColor)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .disabled(isAuthenticating)
                .padding(.horizontal, 48)
                .accessibilityLabel("Authenticate with \(biometric.biometricName)")

                Button("Skip") {
                    onUnlock()
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .accessibilityLabel("Skip biometric authentication")
            }
        }
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
