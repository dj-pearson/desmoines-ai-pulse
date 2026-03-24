import SwiftUI

/// Insider tips section — shows exclusive tips for subscribers or a teaser for free users.
struct EventDetailInsiderTips: View {
    let event: Event
    let hasPremiumAccess: Bool
    let currentTier: SubscriptionTier
    let onShowSubscription: () -> Void

    var body: some View {
        if hasPremiumAccess {
            premiumContent
        } else {
            freeTeaser
        }
    }

    // MARK: - Premium Content

    private var premiumContent: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "star.circle.fill")
                    .font(.title3)
                    .foregroundStyle(.orange)
                Text("Insider Tip")
                    .font(.headline)
                    .foregroundStyle(.orange)
                Spacer()
                PremiumBadge(tier: currentTier == .vip ? .vip : .insider)
            }

            Text(insiderTipText)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineSpacing(3)
        }
        .padding()
        .background(Color.orange.opacity(0.06), in: RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal)
        .padding(.top, 8)
    }

    // MARK: - Free Teaser

    private var freeTeaser: some View {
        Button {
            onShowSubscription()
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "lock.fill")
                    .font(.subheadline)
                    .foregroundStyle(.orange)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Insider Tips Available")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                    Text("Upgrade to get exclusive tips, calendar sync, and ad-free browsing")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .padding(14)
            .background(Color.orange.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color.orange.opacity(0.15), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .padding(.horizontal)
        .padding(.top, 8)
        .accessibilityLabel("Unlock Insider Tips by upgrading to a premium plan")
    }

    // MARK: - Tip Generation

    /// Generates a contextual insider tip based on event attributes.
    private var insiderTipText: String {
        var tips: [String] = []

        if event.isFree {
            tips.append("This is a free event — arrive early for the best spots!")
        }

        if let venue = event.venue, venue.lowercased().contains("downtown") {
            tips.append("Parking can fill up fast downtown. Consider using the Des Moines Skywalk system or DART bus.")
        } else if event.coordinate != nil {
            tips.append("Check the map for nearby parking options. Rideshare drops off nearby too.")
        }

        switch event.eventCategory {
        case .music:
            tips.append("Bring ear protection for indoor venues. Outdoor shows are great with a blanket or lawn chair.")
        case .food:
            tips.append("Come hungry! Many food events offer sample-size portions so you can try everything.")
        case .outdoor:
            tips.append("Check the weather forecast and dress in layers. Iowa weather can change quickly!")
        case .family:
            tips.append("Most family events have activities for all ages. Strollers are usually welcome.")
        case .art:
            tips.append("Many art events feature local Des Moines artists. Ask about pieces — they love to talk about their work!")
        default:
            tips.append("Get there a bit early to find your spot and enjoy the full experience.")
        }

        return tips.joined(separator: " ")
    }
}

#Preview {
    VStack {
        EventDetailInsiderTips(
            event: .preview,
            hasPremiumAccess: true,
            currentTier: .insider,
            onShowSubscription: {}
        )
        EventDetailInsiderTips(
            event: .preview,
            hasPremiumAccess: false,
            currentTier: .free,
            onShowSubscription: {}
        )
    }
}
