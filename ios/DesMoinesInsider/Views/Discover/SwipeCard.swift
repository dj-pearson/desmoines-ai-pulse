import SwiftUI

/// A single swipe card. Pure presentation — gesture handling lives in
/// `SwipeCardStack`. The `dragOffset` and `boostFraction` props let the
/// stack drive the like/skip/boost overlays from the active drag.
struct SwipeCard: View {
    let item: SwipeItem
    var dragOffset: CGSize = .zero
    var isTopCard: Bool = true

    /// Threshold (pt) past which a directional intent is treated as committed.
    static let commitThreshold: CGFloat = 110

    private var likeFraction: Double {
        guard isTopCard, dragOffset.width > 0 else { return 0 }
        return min(1, Double(dragOffset.width) / Double(Self.commitThreshold))
    }

    private var skipFraction: Double {
        guard isTopCard, dragOffset.width < 0 else { return 0 }
        return min(1, Double(-dragOffset.width) / Double(Self.commitThreshold))
    }

    private var boostFraction: Double {
        guard isTopCard, dragOffset.height < 0,
              abs(dragOffset.height) > abs(dragOffset.width) else { return 0 }
        return min(1, Double(-dragOffset.height) / Double(Self.commitThreshold))
    }

    var body: some View {
        ZStack(alignment: .top) {
            // Hero image
            CachedAsyncImage(url: item.imageUrl) {
                placeholderGradient
            }
            .aspectRatio(contentMode: .fill)
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            // Bottom legibility scrim + content
            VStack {
                Spacer()
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        Image(systemName: item.typeIcon)
                            .font(.caption.weight(.semibold))
                        Text(item.typeLabel)
                            .font(.caption.weight(.semibold))
                    }
                    .foregroundStyle(.white.opacity(0.9))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(.ultraThinMaterial.opacity(0.7), in: Capsule())
                    .environment(\.colorScheme, .dark)

                    Text(item.title)
                        .font(.title2.bold())
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)

                    HStack(spacing: 10) {
                        Text(item.subtitle)
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.white.opacity(0.85))
                        if !item.locationText.isEmpty {
                            HStack(spacing: 3) {
                                Image(systemName: "mappin.and.ellipse")
                                    .font(.caption2)
                                Text(item.locationText)
                                    .font(.caption)
                                    .lineLimit(1)
                            }
                            .foregroundStyle(.white.opacity(0.75))
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(20)
                .background(
                    LinearGradient(
                        colors: [
                            Color.black.opacity(0),
                            Color.black.opacity(0.55),
                            Color.black.opacity(0.85)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
            }

            // Swipe intent overlays — fade in as the user drags.
            if isTopCard {
                overlay(label: "NOPE", color: .red, alignment: .topTrailing,
                        rotation: 14, opacity: skipFraction)
                overlay(label: "LIKE", color: .green, alignment: .topLeading,
                        rotation: -14, opacity: likeFraction)
                overlay(label: "MORE LIKE THIS", color: .blue,
                        alignment: .top, rotation: 0, opacity: boostFraction)
            }
        }
        // Size is owned by SwipeCardStack via .frame(width:height:) — no
        // greedy maxWidth/maxHeight here, otherwise the card stretches to
        // fill ancestors and overflows the deck area.
        .background(Color(.systemGray5))
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder(Color.white.opacity(0.08), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.18), radius: 18, x: 0, y: 12)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityHint("Swipe right to save, left to skip, up for more like this. Or use the buttons below.")
    }

    private var accessibilityLabel: String {
        var parts: [String] = [item.title, item.typeLabel, item.subtitle]
        if !item.locationText.isEmpty { parts.append(item.locationText) }
        return parts.filter { !$0.isEmpty }.joined(separator: ". ")
    }

    private var placeholderGradient: some View {
        Group {
            switch item {
            case .event(let e):
                Rectangle().fill(e.eventCategory.color.gradient)
            case .restaurant:
                Rectangle().fill(Color.orange.opacity(0.6).gradient)
            }
        }
    }

    @ViewBuilder
    private func overlay(label: String, color: Color, alignment: Alignment, rotation: Double, opacity: Double) -> some View {
        Text(label)
            .font(.title.weight(.heavy))
            .foregroundStyle(color)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(color, lineWidth: 4)
                    .background(Color.white.opacity(0.85), in: RoundedRectangle(cornerRadius: 8))
            )
            .rotationEffect(.degrees(rotation))
            .opacity(opacity)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: alignment)
            .padding(28)
            .allowsHitTesting(false)
    }
}

#Preview {
    SwipeCard(item: .event(.preview))
        .padding(20)
        .frame(height: 540)
}
