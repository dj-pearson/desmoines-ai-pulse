import SwiftUI

@main
struct DesMoinesInsiderApp: App {
    @State private var authService = AuthService.shared
    @State private var favoritesService = FavoritesService.shared
    @State private var locationService = LocationService.shared

    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false

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
                if authService.isAuthenticated {
                    await favoritesService.loadFavorites()
                }
            }
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
