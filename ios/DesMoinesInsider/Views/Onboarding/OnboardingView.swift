import SwiftUI

/// Onboarding flow shown on first launch: a welcome page, a "What are you
/// into?" interest picker, then a final, skippable trial moment that presents
/// the annual free-trial paywall (IOS-SUB-013). The trial screen never
/// hard-walls the app — "Maybe later" is one tap and always lets the user into
/// the app (App Store-safe).
///
/// The interest step replaced two static feature pages (IOS-DD-ACCOUNT-04).
/// The picks are saved on the device (InterestPreferences) and rerank the
/// cold-start For You rail at once, so a new user's first Home screen already
/// leads with their kind of thing; the next sign-in copies them to the profile.
struct OnboardingView: View {
    @Binding var hasCompletedOnboarding: Bool
    @State private var currentPage = 0
    @State private var pickedInterests: Set<String> = []
    @ScaledMetric(relativeTo: .largeTitle) private var logoHeight: CGFloat = 160
    @ScaledMetric(relativeTo: .largeTitle) private var heroIconSize: CGFloat = 72
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
        // Skipping from the welcome page must not wipe picks saved earlier.
        if !pickedInterests.isEmpty { saveInterests() }
        hasCompletedOnboarding = true
    }

    /// The interest step comes after the value pages.
    private var interestPageIndex: Int { pages.count }
    private var pageCount: Int { pages.count + 1 }

    /// Catalog order, so the stored list is stable.
    private func saveInterests() {
        InterestPreferences.shared.local = InterestCatalog.all
            .map(\.id)
            .filter { pickedInterests.contains($0) }
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
                interestStep
                    .tag(interestPageIndex)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .animation(reduceMotion ? nil : .easeInOut, value: currentPage)

            // Bottom controls
            VStack(spacing: 16) {
                // Page indicator
                HStack(spacing: 8) {
                    ForEach(0..<pageCount, id: \.self) { index in
                        Capsule()
                            .fill(index == currentPage ? Color.accentColor : Color(.systemGray4))
                            .frame(width: index == currentPage ? 24 : 8, height: 8)
                            .animation(reduceMotion ? nil : .spring(response: 0.3), value: currentPage)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Page \(currentPage + 1) of \(pageCount)")
                // Announce page changes to VoiceOver as the user advances (UX-009).
                .onChange(of: currentPage) { _, newValue in
                    AccessibilityNotification.Announcement(
                        AttributedString("Page \(newValue + 1) of \(pageCount)")
                    ).post()
                }

                // Primary action — full-width, ≥44pt (brandPrimary), per UX-009.
                if currentPage < interestPageIndex {
                    Button {
                        withAnimation(reduceMotion ? nil : .default) { currentPage += 1 }
                    } label: {
                        Text("Next")
                    }
                    .buttonStyle(.brandPrimary)
                    .padding(.horizontal)
                } else {
                    Button {
                        saveInterests()
                        analytics.trackOnboardingTrial(action: "shown")
                        SoftPaywallService.shared.noteOnboardingUpsellShown()
                        showTrialStep = true
                    } label: {
                        // "Next" with nothing picked, not "Skip": the
                        // secondary Skip below leaves onboarding entirely, and
                        // two "Skip" buttons doing different things is a trap.
                        Text(pickedInterests.isEmpty ? "Next" : "Continue")
                    }
                    .buttonStyle(.brandPrimary)
                    .padding(.horizontal)
                }

                // Secondary row: Back (when available) + Skip (ALWAYS reachable,
                // including the last onboarding page) — UX-009.
                HStack {
                    if currentPage > 0 {
                        Button("Back") {
                            withAnimation(reduceMotion ? nil : .default) { currentPage -= 1 }
                        }
                        .buttonStyle(.brandGhost(size: .compact))
                        .fixedSize()
                    }

                    Spacer()

                    Button("Skip") {
                        // Emit a funnel event so skipping the value pages isn't a
                        // blind spot like the instrumented trial step
                        // (IOS-AUDIT-UX-029).
                        analytics.trackOnboardingTrial(action: "skipped_value_pages")
                        complete()
                    }
                    .buttonStyle(.brandGhost(size: .compact))
                    .fixedSize()
                }
                .padding(.horizontal)
            }
            .padding(.bottom, 40)
        }
    }

    // MARK: - Trial step (final, skippable)

    private var trialStep: some View {
        ScrollView {
            VStack(spacing: 24) {
                Image(systemName: "sparkles")
                    .font(.system(size: min(heroIconSize, 110)))
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
                .padding(.top, 8)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 48)
            .padding(.bottom, 40)
        }
        .scrollBounceBehavior(.basedOnSize)
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
        ScrollView {
            VStack(spacing: 24) {
                if let assetImage = page.assetImage {
                    Image(assetImage)
                        .resizable()
                        .scaledToFit()
                        // Scales with Dynamic Type but is capped, so the text
                        // below still fits at accessibility sizes and in landscape.
                        .frame(height: min(logoHeight, 200))
                        .accessibilityLabel("Des Moines Insider")
                } else {
                    Image(systemName: page.icon)
                        .font(.system(size: min(heroIconSize * 1.1, 110)))
                        .foregroundStyle(page.color.gradient)
                        .accessibilityHidden(true)
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
                                .accessibilityHidden(true)
                            Text(highlight)
                                .font(.subheadline)
                        }
                    }
                }
                .padding(.horizontal, 40)
                .padding(.top, 8)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 48)
            .padding(.bottom, 24)
        }
        .scrollBounceBehavior(.basedOnSize)
    }

    // MARK: - Interest step (IOS-DD-ACCOUNT-04)

    private var interestStep: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("What are you into?")
                    .font(.title2.bold())
                    .accessibilityAddTraits(.isHeader)
                Text("Pick a few and Home will lead with them. You can change these on your profile.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 10)], spacing: 10) {
                    ForEach(InterestCatalog.all) { option in
                        interestChip(option)
                    }
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 48)
            .padding(.bottom, 24)
        }
        .scrollBounceBehavior(.basedOnSize)
        .task {
            // Returning to onboarding (Debug reset) shows the earlier picks.
            if pickedInterests.isEmpty {
                pickedInterests = Set(InterestPreferences.shared.local)
            }
        }
    }

    private func interestChip(_ option: InterestOption) -> some View {
        let isSelected = pickedInterests.contains(option.id)
        return Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            if isSelected {
                pickedInterests.remove(option.id)
            } else {
                pickedInterests.insert(option.id)
            }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: option.icon)
                    .font(.body)
                    .accessibilityHidden(true)
                Text(option.label)
                    .font(.subheadline.weight(.medium))
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                isSelected ? Color.accentColor.opacity(0.15) : Color(.secondarySystemBackground),
                in: RoundedRectangle(cornerRadius: 12)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(isSelected ? Color.accentColor : Color.clear, lineWidth: 1)
            )
            .foregroundStyle(isSelected ? Color.accentColor : Color.primary)
        }
        .buttonStyle(.plain)
        .minHitTarget()
        .accessibilityLabel(option.label)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
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
