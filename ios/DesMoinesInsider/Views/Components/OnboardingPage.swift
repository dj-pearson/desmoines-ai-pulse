import SwiftUI

/// Single onboarding page template. Compose multiple inside a TabView with
/// `.tabViewStyle(.page)` and pair with `OnboardingPageIndicator` +
/// `OnboardingNavRow`. Mirrors Android `OnboardingPage.kt`.
struct OnboardingPage: View {
    let systemImage: String
    let headline: String
    let subcopy: String

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                Circle()
                    .fill(PremiumTokens.brandGradient)
                    .frame(width: 140, height: 140)
                Image(systemName: systemImage)
                    .font(.system(size: 64, weight: .bold))
                    .foregroundStyle(.white)
            }

            Text(headline)
                .font(.system(size: 30, weight: .heavy))
                .multilineTextAlignment(.center)
                .padding(.top, 32)

            Text(subcopy)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.top, 12)
                .padding(.horizontal, 8)
        }
        .padding(.horizontal, 32)
        .padding(.vertical, 48)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(headline). \(subcopy)")
    }
}

/// Animated page indicator — active dot expands into a pill.
struct OnboardingPageIndicator: View {
    let pageCount: Int
    let currentPage: Int

    var body: some View {
        HStack(spacing: 8) {
            ForEach(0..<pageCount, id: \.self) { index in
                let isActive = index == currentPage
                Capsule()
                    .fill(isActive ? Color.accentColor : Color.secondary.opacity(0.3))
                    .frame(width: isActive ? 24 : 8, height: 8)
                    .animation(
                        .spring(response: 0.4, dampingFraction: 0.65),
                        value: currentPage
                    )
            }
        }
        .accessibilityLabel("Page \(currentPage + 1) of \(pageCount)")
    }
}

/// Bottom nav row for onboarding with Skip + Next / Get started buttons.
struct OnboardingNavRow: View {
    let isLastPage: Bool
    let onSkip: () -> Void
    let onNext: () -> Void

    var body: some View {
        HStack {
            Button("Skip", action: onSkip)
                .foregroundStyle(.secondary)
            Spacer()
            Button {
                HapticFeedback.shared.light()
                onNext()
            } label: {
                Text(isLastPage ? "Get started" : "Next")
                    .font(.headline)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                    .background(Color.accentColor)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: PremiumTokens.cornerLg))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 16)
    }
}

/// Permission priming card shown BEFORE the system permission dialog so users
/// understand the value before being prompted.
struct PermissionPrimingCard: View {
    let systemImage: String
    let title: String
    let body: String
    let primaryLabel: String
    let onPrimary: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                Circle()
                    .fill(Color.accentColor.opacity(0.15))
                    .frame(width: 72, height: 72)
                Image(systemName: systemImage)
                    .font(.system(size: 30, weight: .semibold))
                    .foregroundStyle(Color.accentColor)
            }

            Text(title)
                .font(.title3.bold())
                .multilineTextAlignment(.center)
                .padding(.top, 18)

            Text(body)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.top, 8)

            Button {
                HapticFeedback.shared.medium()
                onPrimary()
            } label: {
                Text(primaryLabel)
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(Color.accentColor)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: PremiumTokens.cornerLg))
            }
            .buttonStyle(.plain)
            .padding(.top, 20)

            Button("Not now", action: onDismiss)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .padding(.top, 4)
        }
        .padding(24)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: PremiumTokens.cornerXl))
        .premiumShadow(elevation: 8)
    }
}

#Preview {
    VStack {
        OnboardingPage(
            systemImage: "sparkles",
            headline: "Discover Des Moines",
            subcopy: "Find events, restaurants, and hidden gems curated just for you."
        )
        OnboardingPageIndicator(pageCount: 4, currentPage: 1)
        OnboardingNavRow(isLastPage: false, onSkip: {}, onNext: {})
    }
}
