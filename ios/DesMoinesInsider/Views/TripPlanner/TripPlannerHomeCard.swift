import SwiftUI

/// IOS-PARITY-001 · Home entry point into the AI Trip Planner.
///
/// A slim, tappable promo card surfaced on Home (alongside the other discovery
/// entry points) so the flagship premium feature is reachable without digging
/// into the Discover hub.
struct TripPlannerHomeCard: View {
    let onTap: () -> Void

    var body: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            onTap()
        } label: {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(LinearGradient(
                            colors: [Color(red: 0.31, green: 0.27, blue: 0.90),
                                     Color(red: 0.23, green: 0.51, blue: 0.96)],
                            startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 48, height: 48)
                    Image(systemName: "map.fill")
                        .font(.title3)
                        .foregroundStyle(.white)
                        .accessibilityHidden(true)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text("Plan your perfect day")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                    Text("Let AI build a Des Moines itinerary in seconds")
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
        .accessibilityLabel("AI Trip Planner. Let AI build a Des Moines itinerary.")
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("Opens the Trip Planner")
    }
}

#Preview {
    TripPlannerHomeCard {}
        .padding()
}
