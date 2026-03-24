import SwiftUI

/// Insider Dining Tips section — shows premium content or upgrade prompt.
struct RestaurantDetailDiningTips: View {
    let restaurant: Restaurant
    let hasPremiumAccess: Bool
    let currentTier: SubscriptionTier
    @Binding var showSubscription: Bool

    var body: some View {
        if hasPremiumAccess {
            premiumContent
        } else {
            upgradePrompt
        }
    }

    // MARK: - Premium Content

    private var premiumContent: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "star.circle.fill")
                    .font(.title3)
                    .foregroundStyle(.orange)
                Text("Insider Dining Tip")
                    .font(.headline)
                    .foregroundStyle(.orange)
                Spacer()
                PremiumBadge(tier: currentTier == .vip ? .vip : .insider)
            }

            Text(diningTipText)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineSpacing(3)
        }
        .padding()
        .background(Color.orange.opacity(0.06), in: RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal)
        .padding(.top, 8)
    }

    // MARK: - Upgrade Prompt

    private var upgradePrompt: some View {
        Button {
            showSubscription = true
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "lock.fill")
                    .font(.subheadline)
                    .foregroundStyle(.orange)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Insider Dining Tips")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                    Text("Upgrade to see exclusive recommendations for this restaurant")
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
        .accessibilityLabel("Unlock Insider Dining Tips by upgrading to a premium plan")
    }

    // MARK: - Dining Tip Generation

    /// Generates a contextual dining tip based on restaurant attributes.
    private var diningTipText: String {
        var tips: [String] = []

        if let price = restaurant.priceRange {
            switch price {
            case "$":
                tips.append("Great value spot! Perfect for a casual meal without breaking the bank.")
            case "$$":
                tips.append("Moderately priced with generous portions — a solid pick for date night or group dinners.")
            case "$$$":
                tips.append("Upscale dining experience. Reservations recommended, especially on weekends.")
            case "$$$$":
                tips.append("Fine dining at its best. Consider the tasting menu for the full experience.")
            default:
                break
            }
        }

        if let cuisine = restaurant.cuisine {
            let lower = cuisine.lowercased()
            if lower.contains("italian") || lower.contains("pizza") {
                tips.append("Ask about daily pasta specials — they're often not on the menu.")
            } else if lower.contains("mexican") || lower.contains("taco") {
                tips.append("Try the house salsa and ask if they have off-menu specials.")
            } else if lower.contains("bbq") || lower.contains("barbecue") {
                tips.append("Get there early — the best cuts sell out fast!")
            } else if lower.contains("asian") || lower.contains("sushi") || lower.contains("chinese") || lower.contains("thai") {
                tips.append("Don't skip the appetizers — they're often the hidden gems here.")
            } else if lower.contains("breakfast") || lower.contains("brunch") {
                tips.append("Weekend brunch gets busy. Arrive before 10 AM or expect a wait.")
            }
        }

        if tips.isEmpty {
            tips.append("Local favorite! Ask your server for their personal recommendation — you won't be disappointed.")
        }

        return tips.joined(separator: " ")
    }
}

#Preview {
    RestaurantDetailDiningTips(
        restaurant: .preview,
        hasPremiumAccess: true,
        currentTier: .insider,
        showSubscription: .constant(false)
    )
}
