import SwiftUI

/// Onboarding flow shown on first launch: a few value pages, then a final,
/// skippable trial moment that presents the annual free-trial paywall
/// (IOS-SUB-013). The trial screen never hard-walls the app — "Maybe later" is
/// one tap and always lets the user into the app (App Store-safe).
struct OnboardingView: View {
    @Binding var hasCompletedOnboarding: Bool
    @State private var currentPage = 0
    /// Once the user passes the value pages, we show the trial step.
    @State private var showTrialStep = false
    @State private var showOnboardingPaywall = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let analytics = AnalyticsService.shared

    private let pages: [OnboardingPageData] = [
        OnboardingPageData(
            icon: "building.2.crop.circle.fill",
            assetImage: "AppLogo",
            title: "Welcome to Des Moines Insider",
            subtitle: "Your guide to the best events, restaurants, and attractions in the Des Moines area.",
            highlights: [
                "Discover events happening near you",
                "Find the best local restaurants",
                "Explore attractions and hidden gems"
            ],
            color: .accentColor
        ),
        OnboardingPageData(
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
        OnboardingPageData(
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
        Group {
            if showTrialStep {
                trialStep
            } else {
                pagingStep
            }
        }
        .sheet(isPresented: $showOnboardingPaywall, onDismiss: { complete() }) {
            // Annual preselected so the 7-day free trial is the headline.
            PaywallView(context: .onboarding, preferredPeriod: .annual)
        }
    }

    private func complete() {
        hasCompletedOnboarding = true
    }

    // MARK: - Value pages

    private var pagingStep: some View {
        VStack(spacing: 0) {
            // Pages
            TabView(selection: $currentPage) {
                ForEach(pages.indices, id: \.self) { index in
                    pageView(pages[index])
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .animation(reduceMotion ? nil : .easeInOut, value: currentPage)

            // Bottom controls
            VStack(spacing: 16) {
                // Page indicator
                HStack(spacing: 8) {
                    ForEach(pages.indices, id: \.self) { index in
                        Capsule()
                            .fill(index == currentPage ? Color.accentColor : Color(.systemGray4))
                            .frame(width: index == currentPage ? 24 : 8, height: 8)
                            .animation(reduceMotion ? nil : .spring(response: 0.3), value: currentPage)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Page \(currentPage + 1) of \(pages.count)")

                // Buttons
                HStack(spacing: 16) {
                    if currentPage > 0 {
                        Button("Back") {
                            withAnimation(reduceMotion ? nil : .default) { currentPage -= 1 }
                        }
                        .foregroundStyle(.secondary)
                    }

                    Spacer()

                    if currentPage < pages.count - 1 {
                        Button {
                            withAnimation(reduceMotion ? nil : .default) { currentPage += 1 }
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
                            analytics.trackOnboardingTrial(action: "shown")
                            SoftPaywallService.shared.noteOnboardingUpsellShown()
                            showTrialStep = true
                        } label: {
                            Text("Continue")
                                .fontWeight(.semibold)
                                .padding(.horizontal, 32)
                                .padding(.vertical, 12)
                                .background(Color.accentColor, in: Capsule())
                                .foregroundStyle(.white)
                        }
                    }
                }
                .padding(.horizontal)

                // Skip — bypasses the rest of onboarding entirely (one tap, never blocks)
                if currentPage < pages.count - 1 {
                    Button("Skip") {
                        complete()
                    }
                    .font(.subheadline)
                    .foregroundStyle(.tertiary)
                }
            }
            .padding(.bottom, 40)
        }
    }

    // MARK: - Trial step (final, skippable)

    private var trialStep: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "sparkles")
                .font(.system(size: 72))
                .foregroundStyle(Color.accentColor.gradient)
                .accessibilityHidden(true)

            Text("Try Insider free for 7 days")
                .font(.title.bold())
                .multilineTextAlignment(.center)

            Text("Unlock the full experience. Cancel anytime — no charge during your trial.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            VStack(alignment: .leading, spacing: 12) {
                trialBullet("heart.fill", "Unlimited saved favorites")
                trialBullet("map.fill", "AI Trip Planner itineraries")
                trialBullet("slider.horizontal.3", "Advanced filters & insider tips")
                trialBullet("eye.slash.fill", "Ad-free browsing")
            }
            .padding(.horizontal, 40)
            .padding(.top, 4)

            Spacer()

            VStack(spacing: 12) {
                Button {
                    analytics.trackOnboardingTrial(action: "start_tapped")
                    showOnboardingPaywall = true
                } label: {
                    Text("Start Free Trial")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 14))
                        .foregroundStyle(.white)
                }
                .accessibilityHint("Opens the subscription options with a free trial")

                Button("Maybe later") {
                    analytics.trackOnboardingTrial(action: "skipped")
                    complete()
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 32)
        }
        .padding(.bottom, 40)
    }

    private func trialBullet(_ icon: String, _ text: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.body)
                .foregroundStyle(Color.accentColor)
                .frame(width: 24)
                .accessibilityHidden(true)
            Text(text)
                .font(.subheadline)
        }
    }

    // MARK: - Page View

    private func pageView(_ page: OnboardingPageData) -> some View {
        VStack(spacing: 24) {
            Spacer()

            if let assetImage = page.assetImage {
                Image(assetImage)
                    .resizable()
                    .scaledToFit()
                    .frame(height: 160)
            } else {
                Image(systemName: page.icon)
                    .font(.system(size: 80))
                    .foregroundStyle(page.color.gradient)
            }

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

private struct OnboardingPageData {
    let icon: String
    /// If set, uses a bundled image from the asset catalog instead of an SF Symbol.
    var assetImage: String? = nil
    let title: String
    let subtitle: String
    let highlights: [String]
    let color: Color
}

#Preview {
    OnboardingView(hasCompletedOnboarding: .constant(false))
}
