import SwiftUI

/// The row's own local guide: `geo_summary` and `geo_key_facts`
/// (IOS-DD-RESTAURANTS-11). Free, as on the web (RestaurantDetails.tsx), with
/// the same AI-assisted disclosure, and absent when the row has neither.
///
/// This replaced a paywalled "Insider Dining Tip" that was a switch on price
/// range and a cuisine substring, so every $$ Italian place got the same
/// sentence under a promise of "exclusive recommendations for this
/// restaurant".
struct RestaurantLocalGuide: View {
    let restaurant: Restaurant

    @State private var showDisclosure = false

    static let maxFacts = 6

    /// Trimmed, non-empty facts, at most `maxFacts`.
    static func facts(for restaurant: Restaurant) -> [String] {
        let trimmed = (restaurant.geoKeyFacts ?? []).compactMap { fact -> String? in
            guard let value = fact?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return nil }
            return value
        }
        return Array(trimmed.prefix(maxFacts))
    }

    static func summary(for restaurant: Restaurant) -> String? {
        guard let value = restaurant.geoSummary?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return nil }
        return value
    }

    static func hasContent(_ restaurant: Restaurant) -> Bool {
        summary(for: restaurant) != nil || !facts(for: restaurant).isEmpty
    }

    var body: some View {
        if Self.hasContent(restaurant) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Text("Local dining guide")
                        .font(.title3.bold())
                        .accessibilityAddTraits(.isHeader)
                    Spacer(minLength: 0)
                    Button {
                        showDisclosure = true
                    } label: {
                        Label("AI-assisted", systemImage: "info.circle")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color(.systemGray5), in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Explains how this guide was written")
                    .popover(isPresented: $showDisclosure) {
                        Text("Drafted with AI from public information. Check hours, prices and details with the restaurant.")
                            .font(.subheadline)
                            .padding()
                            .frame(maxWidth: 280)
                            .presentationCompactAdaptation(.popover)
                    }
                }

                if let summary = Self.summary(for: restaurant) {
                    Text(summary)
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .lineSpacing(3)
                }

                let facts = Self.facts(for: restaurant)
                if !facts.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(Array(facts.enumerated()), id: \.offset) { _, fact in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Image(systemName: "circle.fill")
                                    .font(.system(size: 5))
                                    .foregroundStyle(.secondary)
                                    .accessibilityHidden(true)
                                Text(fact)
                                    .font(.subheadline)
                            }
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
        }
    }
}

#Preview {
    var restaurant = Restaurant.preview
    restaurant.geoSummary = "A horror-themed burger bar in the East Village."
    restaurant.geoKeyFacts = ["Late-night kitchen on weekends", "Craft cocktails"]
    return RestaurantLocalGuide(restaurant: restaurant)
}
