import SwiftUI

/// Value prop row shown inside a SubscriptionTierCard.
struct TierValueProp: Identifiable {
    let id = UUID()
    let systemImage: String
    let text: String
}

/// Animated subscription tier card used in the redesigned SubscriptionScreen.
/// Mirrors Android `SubscriptionTierCard.kt`.
///
/// - Featured tier scales up slightly and gets a brand gradient border.
/// - VIP tier gets the premium gold gradient border and badge.
/// - Price crossfades on billing cycle change.
/// - CTA plays `HapticFeedback.shared.premiumUnlock()` on tap.
struct SubscriptionTierCard: View {
    let tierName: String
    let price: String
    let billingLabel: String
    let tagline: String
    let valueProps: [TierValueProp]
    let ctaLabel: String
    var isFeatured: Bool = false
    var isVip: Bool = false
    var strikethroughPrice: String? = nil
    let onCtaTap: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // IOS-COMPLY-003: price is critical content — scale the fixed point size with
    // Dynamic Type (relative to .largeTitle) so it grows up to AX5 without clipping.
    @ScaledMetric(relativeTo: .largeTitle) private var priceSize: CGFloat = 34

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack(spacing: 8) {
                Text(tierName)
                    .font(.title2.bold())
                if isVip {
                    VipGoldBadge()
                }
                Spacer()
            }

            Text(tagline)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .padding(.top, 2)

            // Price row with crossfade
            HStack(alignment: .lastTextBaseline, spacing: 6) {
                Text(price)
                    .font(.system(size: priceSize, weight: .heavy))
                    .contentTransition(.numericText())
                    .animation(
                        reduceMotion ? .linear(duration: 0) : .spring(response: 0.4, dampingFraction: 0.75),
                        value: price
                    )
                Text(billingLabel)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                if let strikethroughPrice {
                    Text(strikethroughPrice)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .strikethrough()
                }
            }
            .padding(.top, 14)

            // Value props
            VStack(alignment: .leading, spacing: 10) {
                ForEach(valueProps.prefix(4)) { prop in
                    HStack(spacing: 10) {
                        ZStack {
                            Circle()
                                .fill(isVip
                                      ? AnyShapeStyle(PremiumTokens.premiumGoldGradient)
                                      : AnyShapeStyle(Color.accentColor.opacity(0.18)))
                                .frame(width: 22, height: 22)
                            Image(systemName: prop.systemImage)
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(isVip ? Color.white : Color.accentColor)
                        }
                        Text(prop.text)
                            .font(.subheadline)
                    }
                }
            }
            .padding(.top, 16)

            // CTA
            Button {
                HapticFeedback.shared.premiumUnlock()
                onCtaTap()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.system(size: 16, weight: .bold))
                    Text(ctaLabel)
                        .font(.headline)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .background(
                    isVip
                        ? AnyShapeStyle(PremiumTokens.premiumGoldGradient)
                        : AnyShapeStyle(Color.accentColor)
                )
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: PremiumTokens.cornerLg))
            }
            .buttonStyle(.pressableCard)
            .padding(.top, 18)
        }
        .padding(20)
        .glassCard(cornerRadius: PremiumTokens.cornerXl, material: .regularMaterial, elevation: isFeatured ? PremiumTokens.elevation8 : PremiumTokens.elevation4)
        .overlay(
            RoundedRectangle(cornerRadius: PremiumTokens.cornerXl)
                .strokeBorder(
                    isVip
                        ? AnyShapeStyle(PremiumTokens.premiumGoldGradient)
                        : (isFeatured
                           ? AnyShapeStyle(PremiumTokens.brandGradient)
                           : AnyShapeStyle(Color.clear)),
                    lineWidth: isVip ? 2 : (isFeatured ? 1.5 : 0)
                )
        )
        .scaleEffect(isFeatured ? 1.03 : 1.0)
        .premiumShadow(elevation: isFeatured ? 12 : 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(tierName) tier. \(price) \(billingLabel). \(tagline).")
    }
}

/// Monthly / Annual billing toggle matching Android `BillingCycleToggle`.
///
/// NOTE (IOS-AUDIT-UX-032): this component and `SubscriptionTierCard` are not yet
/// wired to a live screen. Before using them in production, drive `annualLabel`
/// and the card's `price`/`billingLabel` from StoreKit (`Product.displayPrice`
/// and PaywallView's computed `annualSavingsPercent`) — do NOT ship the
/// placeholder "save 20%" / "$14.99" strings, which can diverge from the real
/// products.
struct BillingCycleToggle: View {
    @Binding var isAnnual: Bool
    /// Defaults to a neutral label so a real savings percent (from StoreKit) is
    /// supplied at the call site rather than hardcoded.
    var annualLabel: String = "Annual"

    var body: some View {
        HStack(spacing: 4) {
            segment(label: "Monthly", selected: !isAnnual) { isAnnual = false }
            segment(label: annualLabel, selected: isAnnual) { isAnnual = true }
        }
        .padding(4)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: PremiumTokens.cornerLg))
    }

    @ViewBuilder
    private func segment(label: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.shared.selection()
            action()
        } label: {
            Text(label)
                .font(.subheadline.weight(selected ? .bold : .regular))
                .padding(.horizontal, 18)
                .padding(.vertical, 10)
                .background(selected ? Color(.systemBackground) : Color.clear)
                .foregroundStyle(selected ? Color.accentColor : Color.secondary)
                .clipShape(RoundedRectangle(cornerRadius: PremiumTokens.cornerMd))
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    VStack(spacing: 16) {
        BillingCycleToggle(isAnnual: .constant(true))
        SubscriptionTierCard(
            tierName: "VIP",
            price: "$14.99",
            billingLabel: "/ month",
            tagline: "Everything unlocked, zero ads.",
            valueProps: [
                TierValueProp(systemImage: "sparkles", text: "Unlimited favorites"),
                TierValueProp(systemImage: "bell.badge.fill", text: "Early event alerts"),
                TierValueProp(systemImage: "brain.head.profile", text: "AI trip planning"),
                TierValueProp(systemImage: "gift.fill", text: "Exclusive perks")
            ],
            ctaLabel: "Go VIP",
            isFeatured: true,
            isVip: true,
            onCtaTap: {}
        )
    }
    .padding()
}
