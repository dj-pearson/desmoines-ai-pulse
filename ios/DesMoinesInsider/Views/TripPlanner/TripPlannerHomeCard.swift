import SwiftUI

/// IOS-PARITY-001 · Home entry point into the AI Trip Planner.
///
/// A slim, tappable promo card surfaced on Home (alongside the other discovery
/// entry points) so the flagship premium feature is reachable without digging
/// into the Discover hub. Free users see an "Insider" tag, so the tap that
/// ends at a paywall is not a surprise (IOS-DD-TRIP-PLANNER-19).
struct TripPlannerHomeCard: View {
    let isFreeTier: Bool
    let onTap: () -> Void

    private static let title = "Plan your perfect day"
    private static let subtitle = "Let AI build a Des Moines itinerary"

    var body: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            onTap()
        } label: {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color.accentColor)
                        .frame(width: 48, height: 48)
                    Image(systemName: "map.fill")
                        .font(.title3)
                        .foregroundStyle(.white)
                        .accessibilityHidden(true)
                }

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(Self.title)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                        if isFreeTier {
                            Text("Insider")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(Color.accentColor)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.accentColor.opacity(0.15), in: Capsule())
                        }
                    }
                    Text(Self.subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }

                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
            }
            .padding(14)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .strokeBorder(Color(.separator).opacity(0.4), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        // Starts with the visible title, so voice control can find it by what
        // it says (WCAG 2.5.3).
        .accessibilityLabel(Self.accessibilityLabel(isFreeTier: isFreeTier))
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("Opens the Trip Planner")
    }
}

extension TripPlannerHomeCard {
    static func accessibilityLabel(isFreeTier: Bool) -> String {
        "\(title). \(subtitle)" + (isFreeTier ? ", Insider feature" : "")
    }
}

#Preview {
    VStack(spacing: 12) {
        TripPlannerHomeCard(isFreeTier: true) {}
        TripPlannerHomeCard(isFreeTier: false) {}
    }
    .padding()
}
