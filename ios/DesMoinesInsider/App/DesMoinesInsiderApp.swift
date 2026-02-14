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
                if authService.isLoading {
                    LaunchScreenView()
                } else if !hasCompletedOnboarding {
                    OnboardingView(hasCompletedOnboarding: $hasCompletedOnboarding)
                } else {
                    MainTabView()
                }
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

            VStack(spacing: 16) {
                Image(systemName: "building.2.crop.circle.fill")
                    .font(.system(size: 72))
                    .foregroundStyle(Color.accentColor)

                Text("Des Moines Insider")
                    .font(.title.bold())
                    .foregroundStyle(.white)

                ProgressView()
                    .tint(Color.accentColor)
            }
        }
    }
}
