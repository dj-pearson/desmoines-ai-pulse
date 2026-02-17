import SwiftUI
import StoreKit

@main
struct DesMoinesInsiderApp: App {
    @State private var authService = AuthService.shared
    @State private var favoritesService = FavoritesService.shared
    @State private var locationService = LocationService.shared

    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false
    @AppStorage("appLaunchCount") private var launchCount = 0

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
                } else {
                    MainTabView()
                }
            }
            .onOpenURL { url in
                // Handle auth callbacks (email verification, OAuth redirects, etc.)
                SupabaseService.shared.client?.handle(url)
            }
            .task {
                launchCount += 1

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
