import SwiftUI

/// Three-step onboarding flow shown on first launch.
struct OnboardingView: View {
    @Binding var hasCompletedOnboarding: Bool
    @State private var currentPage = 0

    private let pages: [OnboardingPage] = [
        OnboardingPage(
            icon: "building.2.crop.circle.fill",
            title: "Welcome to Des Moines Insider",
            subtitle: "Your guide to the best events, restaurants, and attractions in the Des Moines area.",
            highlights: [
                "Discover events happening near you",
                "Find the best local restaurants",
                "Explore attractions and hidden gems"
            ],
            color: .accentColor
        ),
        OnboardingPage(
            icon: "heart.circle.fill",
            title: "Save Your Favorites",
            subtitle: "Keep track of events and places you love. Never miss what matters to you.",
            highlights: [
                "Tap the heart to save events",
                "Build your personal collection",
                "Get reminded before events start"
            ],
            color: .red
        ),
        OnboardingPage(
            icon: "map.circle.fill",
            title: "Explore What's Nearby",
            subtitle: "Use the map to discover events and restaurants near your current location.",
            highlights: [
                "See events on an interactive map",
                "Filter by category and date",
                "Get directions with one tap"
            ],
            color: .blue
        ),
    ]

    var body: some View {
        VStack(spacing: 0) {
            // Pages
            TabView(selection: $currentPage) {
                ForEach(pages.indices, id: \.self) { index in
                    pageView(pages[index])
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .animation(.easeInOut, value: currentPage)

            // Bottom controls
            VStack(spacing: 16) {
                // Page indicator
                HStack(spacing: 8) {
                    ForEach(pages.indices, id: \.self) { index in
                        Capsule()
                            .fill(index == currentPage ? Color.accentColor : Color(.systemGray4))
                            .frame(width: index == currentPage ? 24 : 8, height: 8)
                            .animation(.spring(response: 0.3), value: currentPage)
                    }
                }

                // Buttons
                HStack(spacing: 16) {
                    if currentPage > 0 {
                        Button("Back") {
                            withAnimation { currentPage -= 1 }
                        }
                        .foregroundStyle(.secondary)
                    }

                    Spacer()

                    if currentPage < pages.count - 1 {
                        Button {
                            withAnimation { currentPage += 1 }
                        } label: {
                            Text("Next")
                                .fontWeight(.semibold)
                                .padding(.horizontal, 32)
                                .padding(.vertical, 12)
                                .background(Color.accentColor, in: Capsule())
                                .foregroundStyle(.white)
                        }
                    } else {
                        Button {
                            withAnimation {
                                hasCompletedOnboarding = true
                            }
                        } label: {
                            Text("Get Started")
                                .fontWeight(.semibold)
                                .padding(.horizontal, 32)
                                .padding(.vertical, 12)
                                .background(Color.accentColor, in: Capsule())
                                .foregroundStyle(.white)
                        }
                    }
                }
                .padding(.horizontal)

                // Skip
                if currentPage < pages.count - 1 {
                    Button("Skip") {
                        hasCompletedOnboarding = true
                    }
                    .font(.subheadline)
                    .foregroundStyle(.tertiary)
                }
            }
            .padding(.bottom, 40)
        }
    }

    // MARK: - Page View

    private func pageView(_ page: OnboardingPage) -> some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: page.icon)
                .font(.system(size: 80))
                .foregroundStyle(page.color.gradient)

            Text(page.title)
                .font(.title2.bold())
                .multilineTextAlignment(.center)

            Text(page.subtitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            VStack(alignment: .leading, spacing: 12) {
                ForEach(page.highlights, id: \.self) { highlight in
                    HStack(spacing: 10) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.body)
                            .foregroundStyle(page.color)
                        Text(highlight)
                            .font(.subheadline)
                    }
                }
            }
            .padding(.horizontal, 40)
            .padding(.top, 8)

            Spacer()
            Spacer()
        }
    }
}

// MARK: - Page Model

private struct OnboardingPage {
    let icon: String
    let title: String
    let subtitle: String
    let highlights: [String]
    let color: Color
}

#Preview {
    OnboardingView(hasCompletedOnboarding: .constant(false))
}
